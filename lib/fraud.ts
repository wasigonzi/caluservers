/**
 * Detección de fraude propia (Fase 6, frente A).
 *
 * Lee las FraudRule activas y evalúa un pedido contra cuatro tipos de
 * regla: velocidad, importe, dominio de correo desechable e IP compartida.
 * Cada regla que marca crea un FraudFlag en estado "open".
 *
 * Acción "block": NO se ejecuta en esta fase. Una regla en modo "block"
 * se trata como "flag" y el motivo del flag deja constancia de ello; el
 * bloqueo real de un pago es decisión del dueño (ver docs/FRAUDE.md).
 *
 * La evaluación nunca lanza: ante cualquier error devuelve
 * `{ flagged: false, flags: [] }` y lo registra en consola, para que un
 * fallo del motor de fraude nunca tumbe la creación de un pedido.
 *
 * MaxMind NO está aquí: no hay cuenta ni clave, y no se llama a ningún
 * servicio externo (ver docs/FRAUDE.md).
 */

export type FraudRuleRow = {
  id: string;
  name: string;
  kind: string;
  configJson: unknown;
  action: string;
  active: boolean;
  order: number;
};

export type FraudFlagRow = {
  id: string;
  userId: string;
  orderId: string | null;
  ruleId: string | null;
  reason: string;
  status: string;
};

/** Lo mínimo de la BD que usa el motor: así se puede probar con una BD falsa. */
export type FraudDb = {
  fraudRule: {
    findMany: (args: any) => Promise<FraudRuleRow[]>;
  };
  customerOrder: {
    count: (args: any) => Promise<number>;
  };
  fraudFlag: {
    create: (args: any) => Promise<FraudFlagRow>;
  };
  auditLog: {
    findMany: (args: any) => Promise<{ actorId: string | null }[]>;
  };
};

export type EvaluateFraudInput = {
  userId: string;
  orderId: string;
  /** Correo del cliente; sin él la regla de dominio se salta. */
  email: string | null;
  /** SHA-256 de la IP del pedido; sin él la regla de IP se salta. */
  ipHash: string | null;
  totalCents: number;
  db: FraudDb;
};

export type EvaluateFraudResult = {
  flagged: boolean;
  flags: FraudFlagRow[];
};

function configNumber(config: unknown, key: string, fallback: number): number {
  if (typeof config !== "object" || config === null) return fallback;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function configStrings(config: unknown, key: string): string[] {
  if (typeof config !== "object" || config === null) return [];
  const value = (config as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function emailDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

export async function evaluateFraud(input: EvaluateFraudInput): Promise<EvaluateFraudResult> {
  const empty: EvaluateFraudResult = { flagged: false, flags: [] };
  try {
    const rules = await input.db.fraudRule.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
    });
    const flags: FraudFlagRow[] = [];
    for (const rule of rules) {
      try {
        const reason = await evaluateRule(input, rule);
        if (!reason) continue;
        const fullReason =
          rule.action === "block"
            ? `${reason} La regla está en modo «block», tratado como marca en esta fase; el bloqueo real no está activo.`
            : reason;
        const flag = await input.db.fraudFlag.create({
          data: {
            userId: input.userId,
            orderId: input.orderId,
            ruleId: rule.id,
            reason: fullReason,
            status: "open",
          },
        });
        flags.push(flag);
      } catch (error) {
        // Una regla rota no tumba las demás ni el pedido.
        console.error(`[fraude] la regla ${rule.id} falló:`, error instanceof Error ? error.message : error);
      }
    }
    return { flagged: flags.length > 0, flags };
  } catch (error) {
    console.error("[fraude] la evaluación falló:", error instanceof Error ? error.message : error);
    return empty;
  }
}

/**
 * Evalúa una sola regla. Devuelve el motivo en español cuando marca, o
 * null cuando no marca (o cuando faltan los datos que la regla necesita).
 */
async function evaluateRule(input: EvaluateFraudInput, rule: FraudRuleRow): Promise<string | null> {
  const now = new Date();
  switch (rule.kind) {
    case "velocity": {
      const maxOrders = configNumber(rule.configJson, "maxOrders", 3);
      const windowMinutes = configNumber(rule.configJson, "windowMinutes", 60);
      const since = new Date(now.getTime() - windowMinutes * 60_000);
      const count = await input.db.customerOrder.count({
        where: { userId: input.userId, createdAt: { gte: since } },
      });
      // El pedido que se está evaluando ya está creado y cuenta: más de
      // maxOrders pedidos en la ventana marca (4 en 1 h con el umbral 3).
      if (count > maxOrders) {
        return `Más de ${maxOrders} pedidos en ${windowMinutes} minutos (${count} pedidos)`;
      }
      return null;
    }
    case "amount": {
      const maxCents = configNumber(rule.configJson, "maxCents", 50000);
      if (input.totalCents > maxCents) {
        return `Importe de $${(input.totalCents / 100).toFixed(2)} superior al máximo de $${(maxCents / 100).toFixed(2)}`;
      }
      return null;
    }
    case "email_domain": {
      const domains = configStrings(rule.configJson, "domains").map((d) => d.toLowerCase());
      const domain = emailDomain(input.email);
      if (domain && domains.includes(domain)) {
        return `El dominio del correo (${domain}) está en la lista de dominios desechables`;
      }
      return null;
    }
    case "ip": {
      // La IP hasheada vive en el diario de auditoría unificado
      // (AuditLog.ipHash): es el único sitio donde se guarda. Sin
      // entradas de auditoría con ese ipHash la regla no marca; nunca
      // bloquea por falta de datos. Ver docs/FRAUDE.md.
      if (!input.ipHash) return null;
      const maxAccounts = configNumber(rule.configJson, "maxAccounts", 3);
      const windowMinutes = configNumber(rule.configJson, "windowMinutes", 24 * 60);
      const since = new Date(now.getTime() - windowMinutes * 60_000);
      const rows = await input.db.auditLog.findMany({
        where: { ipHash: input.ipHash, createdAt: { gte: since } },
        select: { actorId: true },
      });
      const accounts = new Set(rows.map((row) => row.actorId).filter((id): id is string => typeof id === "string" && id.length > 0));
      accounts.add(input.userId);
      if (accounts.size > maxAccounts) {
        return `Más de ${maxAccounts} cuentas distintas con la misma IP (${accounts.size} cuentas)`;
      }
      return null;
    }
    default:
      return null;
  }
}
