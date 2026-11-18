import "server-only";
import { randomBytes } from "node:crypto";
import { sanitizeAudit } from "./audit-sanitize";
import { actorTypeFor, writeAuditLogTx } from "./audit-log";
import { applyCredits, applyTaxCents } from "./billing-recurring";
import { TLDS } from "./catalog";
import { billingPolicy, CommerceError, generateOrderTrackingToken } from "./commerce";
import { db } from "./db";
import { DomainQueryError, normalizeDomain } from "./domain-lookup";
import { DomainNameError, normalizeDomainName } from "./domain-name";
import { deliverNotice } from "./mailer";
import { getRegistrar } from "./porkbun";
import { openSecret, sealSecret } from "./secret-box";

export { getRegistrar } from "./porkbun";

/**
 * Servicio de dominios (Fase 3). Sin rutas HTTP: las rutas y la UI las
 * construye otro agente contra esta API.
 *
 * - Los precios de venta viven en TldPrice y se congelan en el pedido y la
 *   factura: un cambio posterior de TldPrice no mueve un pedido ya creado.
 * - Un TLD sin fila activa no se vende automáticamente: `.pr` y otros van
 *   por registro asistido (error 400 honesto, nunca un precio inventado).
 * - El cobro lo hace el flujo normal (pasarela o confirmación manual); este
 *   servicio solo actúa DESPUÉS del pago confirmado (`afterDomainPayment`).
 *   Nunca se crea un CustomerService ni una Subscription de hosting para
 *   un dominio: el pago de un dominio no da de alta hosting.
 * - Si el registrador falla tras el cobro, el fallo queda en
 *   RegisteredDomain.failureReason para reintento manual: nunca se lanza,
 *   porque el pago ya está registrado.
 * - `autoRenew` es solo un flag local (Porkbun no expone un endpoint
 *   verificado) y el auto-renew automático solo usa saldo de crédito: no
 *   hay tarjeta guardada para dominios.
 */

export type DomainKind = "register" | "renewal" | "transfer";

export const DOMAIN_PLAN_IDS: Record<DomainKind, string> = {
  register: "domain",
  renewal: "domain-renewal",
  transfer: "domain-transfer",
};

/** Nameservers guardados como Json: se normalizan a lista de texto. */
export function nameserverList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

/**
 * Vista pública de un dominio registrado: nunca incluye el código de
 * autorización cifrado ni ningún secreto del registrador.
 */
export function publicDomain(domain: {
  id: string;
  domain: string;
  registrarKey: string;
  status: string;
  autoRenew: boolean;
  expiresAt: Date | null;
  nameservers: unknown;
  createdAt: Date;
  updatedAt: Date;
  failureReason: string | null;
  orderId: string | null;
}) {
  return {
    id: domain.id,
    domain: domain.domain,
    registrarKey: domain.registrarKey,
    status: domain.status,
    autoRenew: domain.autoRenew,
    expiresAt: domain.expiresAt ? domain.expiresAt.toISOString() : null,
    nameservers: nameserverList(domain.nameservers),
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
    failureReason: domain.failureReason,
    orderId: domain.orderId,
  };
}

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** 1-13 hostnames válidos (de formulario llegan separados por comas). */
export function parseNameservers(raw: unknown): string[] {
  const list =
    typeof raw === "string"
      ? raw.split(",")
      : Array.isArray(raw)
        ? raw.map((item) => String(item ?? ""))
        : [];
  const names = list.map((name) => name.trim().toLowerCase()).filter(Boolean);
  if (names.length < 1 || names.length > 13) {
    throw new CommerceError("Indica entre 1 y 13 servidores de nombres.", 400);
  }
  for (const name of names) {
    if (name.length > 253 || name.split(".").length < 2) {
      throw new CommerceError(`El servidor de nombres «${name}» no es válido.`, 400);
    }
    for (const label of name.split(".")) {
      if (!LABEL_RE.test(label)) {
        throw new CommerceError(`El servidor de nombres «${name}» no es válido.`, 400);
      }
    }
  }
  return [...new Set(names)];
}

const AUTH_CODE_AAD = "domain:auth-code:v1";

/** Días de guarda de Porkbun: no renovar lo registrado/renovado hace < 30 días. */
const RENEW_MIN_AGE_DAYS = 30;

const ASSISTED_MESSAGE =
  "registro asistido: ese TLD no se registra automáticamente, contacta con soporte";

function tldOf(domain: string): string {
  const parts = domain.split(".");
  return `.${parts[parts.length - 1] ?? ""}`.toLowerCase();
}

/**
 * Valida el dominio con normalizeDomain (RDAP) y devuelve dominio + TLD.
 * Un TLD fuera del catálogo (`.pr`, …) no pasa normalizeDomain: se
 * revalida con normalizeDomainName para extraer el TLD y se devuelve el
 * error de registro asistido, no un 400 genérico.
 */
function resolveDomainForOrder(rawDomain: string): { domain: string; tld: string } {
  try {
    return normalizeDomain(rawDomain);
  } catch (error) {
    if (!(error instanceof DomainQueryError)) throw error;
    let domain: string;
    try {
      domain = normalizeDomainName(rawDomain);
    } catch (nameError) {
      if (nameError instanceof DomainNameError) {
        throw new CommerceError(nameError.message, 400);
      }
      throw nameError;
    }
    throw new CommerceError(`${ASSISTED_MESSAGE} (${tldOf(domain)}).`, 400);
  }
}

function kindLabel(kind: DomainKind): string {
  return kind === "register"
    ? "Registro"
    : kind === "renewal"
      ? "Renovación"
      : "Transferencia";
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return Object.getOwnPropertyDescriptor(error, "code")?.value === "P2002";
}

async function auditEvent(
  action: string,
  actor: string,
  entityId: string | null,
  details: string,
): Promise<void> {
  await db.commerceEvent
    .create({ data: { actor, action, entityId, details: sanitizeAudit(details) } })
    .catch(() => {
      // La traza no debe romper la operación.
    });
}

/* ------------------------------ precios TLD ------------------------------ */

export async function getTldPrice(tld: string, registrarKey = "porkbun") {
  const normalized = tld.startsWith(".") ? tld.toLowerCase() : `.${tld.toLowerCase()}`;
  return db.tldPrice.findUnique({
    where: { tld_registrarKey: { tld: normalized, registrarKey } },
  });
}

export async function listTldPrices(activeOnly = true) {
  return db.tldPrice.findMany({
    ...(activeOnly ? { where: { active: true } } : {}),
    orderBy: { tld: "asc" },
  });
}

/**
 * Crea las filas inactivas de los 6 TLD del catálogo si no existen (sin
 * precio: register/renew/transferCents en 0 y active false). Nunca se
 * vende sin precio.
 */
export async function ensureTldPriceRows(): Promise<{ created: number }> {
  let created = 0;
  for (const tld of TLDS) {
    const existing = await db.tldPrice.findUnique({
      where: { tld_registrarKey: { tld, registrarKey: "porkbun" } },
    });
    if (existing) continue;
    await db.tldPrice.create({
      data: {
        tld,
        registrarKey: "porkbun",
        registerCents: 0,
        renewCents: 0,
        transferCents: 0,
        currency: "USD",
        years: 1,
        active: false,
      },
    });
    created += 1;
  }
  return { created };
}

/**
 * Sincroniza los precios desde Porkbun (POST /pricing/get). Sin
 * credenciales devuelve `{skipped: true}` sin tocar nada. Un TLD solo se
 * activa cuando trae los 3 precios; si la llamada falla, se conservan los
 * precios viejos y queda el evento `billing.tld_sync_failed`.
 */
export async function syncTldPrices(): Promise<{
  updated: number;
  failed: number;
  skipped: boolean;
}> {
  const registrar = getRegistrar();
  let pricing: Awaited<ReturnType<typeof registrar.getPricing>>;
  try {
    pricing = await registrar.getPricing(TLDS);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "unconfigured") return { updated: 0, failed: 0, skipped: true };
    await auditEvent(
      "billing.tld_sync_failed",
      "domain-cron",
      null,
      `registrador=porkbun;error=${error instanceof Error ? error.message : "error"}`,
    );
    return { updated: 0, failed: TLDS.length, skipped: false };
  }
  await ensureTldPriceRows();
  let updated = 0;
  let failed = 0;
  for (const tld of TLDS) {
    const quote = pricing.prices[tld];
    if (!quote) {
      failed += 1;
      continue;
    }
    const active =
      quote.registerCents > 0 && quote.renewCents > 0 && quote.transferCents > 0;
    await db.tldPrice.update({
      where: { tld_registrarKey: { tld, registrarKey: "porkbun" } },
      data: {
        registerCents: quote.registerCents,
        renewCents: quote.renewCents,
        transferCents: quote.transferCents,
        active,
      },
    });
    updated += 1;
  }
  return { updated, failed, skipped: false };
}

/* ------------------------------ pedidos ------------------------------ */

export type CreateDomainOrderInput = {
  userId: string;
  domain: string;
  kind: DomainKind;
  /** Código EPP: obligatorio para transferencias; se guarda cifrado. */
  authCode?: string;
  /** Clave del llamador; si se repite con mismo dominio/usuario/tipo, devuelve el pedido existente. */
  idempotencyKey?: string;
};

/**
 * Impuesto de una factura de dominio. Con TAX_MODE=none se usa
 * applyTaxCents (0 sin TaxRule activa). Si TAX_MODE no es none y no hay
 * TaxRule activa, mismo criterio que createCustomerOrder: taxMode
 * "unconfigured" y factura proforma (no cobrable).
 */
async function domainTax(subtotalCents: number): Promise<{
  taxCents: number | null;
  taxMode: string;
  payable: boolean;
}> {
  const policy = billingPolicy();
  if (policy.ok) {
    const quote = await applyTaxCents(subtotalCents);
    return { taxCents: quote.taxCents, taxMode: quote.taxMode, payable: true };
  }
  const quote = await applyTaxCents(subtotalCents);
  if (quote.taxMode === "tax") {
    return { taxCents: quote.taxCents, taxMode: "tax", payable: true };
  }
  return { taxCents: null, taxMode: "unconfigured", payable: false };
}

/**
 * Crea el pedido de dominio + factura con el precio CONGELADO de TldPrice
 * (1 año). Idempotente por idempotencyKey, como createCustomerOrder. Para
 * transferencias, el código EPP se guarda cifrado en RegisteredDomain
 * (status "pending") para que afterDomainPayment lo use tras el pago.
 */
export async function createDomainOrder(input: CreateDomainOrderInput) {
  const userId = input.userId.trim();
  if (!userId) throw new CommerceError("Falta el cliente del pedido.", 400);
  if (input.kind !== "register" && input.kind !== "renewal" && input.kind !== "transfer") {
    throw new CommerceError("Tipo de pedido de dominio no reconocido.", 400);
  }
  const { domain, tld } = resolveDomainForOrder(input.domain);
  const priceRow = await getTldPrice(tld);
  if (!priceRow?.active) {
    throw new CommerceError(`${ASSISTED_MESSAGE} (${tld}).`, 400);
  }
  const priceCents =
    input.kind === "register"
      ? priceRow.registerCents
      : input.kind === "renewal"
        ? priceRow.renewCents
        : priceRow.transferCents;
  if (priceCents <= 0) {
    throw new CommerceError("Ese TLD no tiene precio de venta todavía.", 409);
  }
  const authCode = input.authCode?.trim() ?? "";
  if (input.kind === "transfer" && !authCode) {
    throw new CommerceError(
      "Falta el código de autorización (EPP) para la transferencia.",
      400,
    );
  }
  let sealedAuthCode: string | null = null;
  if (input.kind === "transfer") {
    try {
      sealedAuthCode = sealSecret(AUTH_CODE_AAD, authCode);
    } catch {
      throw new CommerceError(
        "No se pudo guardar el código de autorización de forma segura.",
        503,
      );
    }
  }
  const key = input.idempotencyKey?.trim() || `domain-${input.kind}-${randomBytes(12).toString("hex")}`;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    throw new CommerceError("La clave de idempotencia no es válida.", 400);
  }
  const policy = billingPolicy();
  if (!policy.currency) throw new CommerceError(policy.ok ? "Moneda no configurada." : policy.error, 409);
  const currency = policy.currency;
  const { taxCents, taxMode, payable } = await domainTax(priceCents);
  const totalCents = priceCents + (taxCents ?? 0);
  const planId = DOMAIN_PLAN_IDS[input.kind];
  const planName = `Dominio ${domain}`;
  const line = {
    planId,
    description: `${kindLabel(input.kind)} de dominio ${domain} · 1 año`,
    quantity: 1,
    unitCents: priceCents,
    totalCents: priceCents,
  };
  // La línea de factura no lleva planId (ver lib/commerce.ts).
  const invoiceLine = {
    description: line.description,
    quantity: 1,
    unitCents: priceCents,
    totalCents: priceCents,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const existing = await tx.customerOrder.findUnique({
          where: { idempotencyKey: key },
          include: { invoice: true },
        });
        if (existing) {
          if (
            existing.userId !== userId ||
            existing.planId !== planId ||
            existing.domain !== domain
          ) {
            throw new CommerceError(
              "Esa clave de idempotencia ya pertenece a otro pedido.",
              409,
            );
          }
          if (!existing.invoice) {
            throw new CommerceError("Ese pedido ya existe sin factura.", 409);
          }
          return { ...existing, invoice: existing.invoice };
        }
        const order = await tx.customerOrder.create({
          data: {
            userId,
            idempotencyKey: key,
            trackingToken: generateOrderTrackingToken(),
            planId,
            planName,
            domain,
            currency,
            totalCents,
            status: "submitted",
            lines: { create: [line] },
          },
        });
        const invoice = await tx.customerInvoice.create({
          data: {
            userId,
            orderId: order.id,
            number: `PF-${order.id.slice(-8).toUpperCase()}`,
            currency,
            subtotalCents: priceCents,
            taxMode,
            taxCents,
            totalCents,
            status: payable ? "issued" : "proforma",
            lines: { create: [invoiceLine] },
          },
        });
        if (input.kind === "transfer" && sealedAuthCode) {
          const existingDomain = await tx.registeredDomain.findUnique({
            where: { domain },
          });
          if (existingDomain?.status === "active") {
            throw new CommerceError("Ese dominio ya está registrado en CaluServers.", 409);
          }
          if (existingDomain) {
            await tx.registeredDomain.update({
              where: { domain },
              data: { userId, authCodeEncrypted: sealedAuthCode, orderId: order.id },
            });
          } else {
            await tx.registeredDomain.create({
              data: {
                domain,
                userId,
                registrarKey: "porkbun",
                status: "pending",
                authCodeEncrypted: sealedAuthCode,
                orderId: order.id,
              },
            });
          }
        }
        await tx.commerceEvent.create({
          data: {
            actor: userId,
            action: "order.created",
            entityId: order.id,
            details: sanitizeAudit(
              `plan=${planId};cents=${totalCents};currency=${currency};tax=${taxMode};domain=${domain}`,
            ),
          },
        });
        // Doble escritura (Fase 6): también a AuditLog, en la misma transacción.
        await writeAuditLogTx(tx, {
          actorType: actorTypeFor(userId),
          actorId: userId,
          action: "order.created",
          resourceType: "order",
          resourceId: order.id,
          details: `plan=${planId};cents=${totalCents};currency=${currency};tax=${taxMode};domain=${domain}`,
        });
        return { ...order, invoice };
      });
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new CommerceError("No se pudo crear el pedido.", 503);
}

/* ------------------------------ tras el pago ------------------------------ */

export type AfterDomainPaymentResult = {
  acted: boolean;
  reason?: string;
  domain?: unknown;
};

type OrderWithPayment = {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  domain: string | null;
  invoice: {
    id: string;
    payment: { status: string } | null;
  } | null;
};

function sanitizedFailure(error: unknown): string {
  // Sin `instanceof Error`: el registrador puede lanzar errores de otro
  // contexto (dobles de pruebas) y el mensaje debe sobrevivir igual.
  const message =
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "Error del registrador.";
  return message.slice(0, 200);
}

async function runRegister(
  order: OrderWithPayment,
  actor: string,
): Promise<AfterDomainPaymentResult> {
  const domain = order.domain ?? "";
  const user = await db.user.findUnique({ where: { id: order.userId } }).catch(() => null);
  const existing = await db.registeredDomain.findUnique({ where: { domain } });
  if (existing?.status === "active" && existing.orderId === order.id) {
    return { acted: false, reason: "ya-activo", domain: existing };
  }
  if (!user?.email) {
    const failureReason = "No hay correo del cliente para registrar el dominio.";
    if (existing) {
      await db.registeredDomain.update({
        where: { domain },
        data: { status: "pending", orderId: order.id, failureReason },
      });
    } else {
      await db.registeredDomain.create({
        data: {
          domain,
          userId: order.userId,
          registrarKey: "porkbun",
          status: "pending",
          orderId: order.id,
          failureReason,
        },
      });
    }
    await auditEvent("domain.register_failed", actor, order.id, `dominio=${domain};error=${failureReason}`);
    return { acted: false, reason: "sin-cliente" };
  }
  if (existing) {
    await db.registeredDomain.update({
      where: { domain },
      data: { status: "pending", orderId: order.id, userId: order.userId, failureReason: null },
    });
  } else {
    await db.registeredDomain.create({
      data: {
        domain,
        userId: order.userId,
        registrarKey: "porkbun",
        status: "pending",
        orderId: order.id,
      },
    });
  }
  const registrar = getRegistrar();
  try {
    const result = await registrar.register({
      domain,
      years: 1,
      registrant: { name: user.name?.trim() || user.email, email: user.email },
    });
    const updated = await db.registeredDomain.update({
      where: { domain },
      data: {
        status: "active",
        registeredAt: new Date(),
        expiresAt: result.expiresAt,
        registryId: result.orderId ?? null,
        failureReason: null,
      },
    });
    await auditEvent(
      "domain.registered",
      actor,
      updated.id,
      `dominio=${domain};registrador=porkbun;pedido-porkbun=${result.orderId ?? "-"}`,
    );
    return { acted: true, domain: updated };
  } catch (error) {
    const failureReason = sanitizedFailure(error);
    await db.registeredDomain.update({
      where: { domain },
      data: { status: "pending", failureReason },
    });
    await auditEvent(
      "domain.register_failed",
      actor,
      order.id,
      `dominio=${domain};error=${failureReason}`,
    );
    return { acted: false, reason: "registro-fallido" };
  }
}

async function runRenew(
  order: OrderWithPayment,
  actor: string,
): Promise<AfterDomainPaymentResult> {
  const domain = order.domain ?? "";
  if (!domain) return { acted: false, reason: "sin-dominio" };
  const row = await db.registeredDomain.findUnique({ where: { domain } });
  if (!row) {
    await auditEvent(
      "domain.renew_failed",
      actor,
      order.id,
      `dominio=${domain};error=El dominio no está registrado en CaluServers.`,
    );
    return { acted: false, reason: "dominio-no-encontrado" };
  }
  if (
    row.registeredAt &&
    Date.now() - new Date(row.registeredAt).getTime() < RENEW_MIN_AGE_DAYS * 86_400_000
  ) {
    const failureReason =
      "El dominio se registró hace menos de 30 días; Porkbun no permite renovarlo aún.";
    await db.registeredDomain.update({
      where: { domain },
      data: { failureReason },
    });
    await auditEvent("domain.renew_failed", actor, row.id, `dominio=${domain};error=${failureReason}`);
    return { acted: false, reason: "renovacion-temprana" };
  }
  const registrar = getRegistrar();
  try {
    const result = await registrar.renew(domain, 1);
    const updated = await db.registeredDomain.update({
      where: { domain },
      data: { expiresAt: result.expiresAt, orderId: order.id, failureReason: null },
    });
    await auditEvent(
      "domain.renewed",
      actor,
      updated.id,
      `dominio=${domain};registrador=porkbun;vence=${result.expiresAt.toISOString().slice(0, 10)}`,
    );
    return { acted: true, domain: updated };
  } catch (error) {
    const failureReason = sanitizedFailure(error);
    await db.registeredDomain.update({
      where: { domain },
      data: { failureReason },
    });
    await auditEvent(
      "domain.renew_failed",
      actor,
      row.id,
      `dominio=${domain};error=${failureReason}`,
    );
    return { acted: false, reason: "renovacion-fallida" };
  }
}

async function runTransfer(
  order: OrderWithPayment,
  actor: string,
): Promise<AfterDomainPaymentResult> {
  const domain = order.domain ?? "";
  if (!domain) return { acted: false, reason: "sin-dominio" };
  const row = await db.registeredDomain.findUnique({ where: { domain } });
  if (!row) {
    await auditEvent(
      "domain.transfer_failed",
      actor,
      order.id,
      `dominio=${domain};error=El dominio no tiene transferencia preparada.`,
    );
    return { acted: false, reason: "dominio-no-encontrado" };
  }
  if (!row.authCodeEncrypted) {
    const failureReason = "Falta el código de autorización guardado para la transferencia.";
    await db.registeredDomain.update({
      where: { domain },
      data: { failureReason },
    });
    await auditEvent(
      "domain.transfer_failed",
      actor,
      row.id,
      `dominio=${domain};error=${failureReason}`,
    );
    return { acted: false, reason: "sin-codigo" };
  }
  let authCode: string;
  try {
    authCode = openSecret(AUTH_CODE_AAD, row.authCodeEncrypted);
  } catch {
    const failureReason = "No se pudo leer el código de autorización guardado.";
    await db.registeredDomain.update({
      where: { domain },
      data: { failureReason },
    });
    await auditEvent(
      "domain.transfer_failed",
      actor,
      row.id,
      `dominio=${domain};error=${failureReason}`,
    );
    return { acted: false, reason: "sin-codigo" };
  }
  const registrar = getRegistrar();
  try {
    await registrar.transfer({ domain, authCode, years: 1 });
    const updated = await db.registeredDomain.update({
      where: { domain },
      data: {
        status: "pending_transfer",
        orderId: order.id,
        authCodeEncrypted: null,
        failureReason: null,
      },
    });
    await auditEvent(
      "domain.transfer_started",
      actor,
      updated.id,
      `dominio=${domain};registrador=porkbun`,
    );
    return { acted: true, domain: updated };
  } catch (error) {
    const failureReason = sanitizedFailure(error);
    await db.registeredDomain.update({
      where: { domain },
      data: { failureReason },
    });
    await auditEvent(
      "domain.transfer_failed",
      actor,
      row.id,
      `dominio=${domain};error=${failureReason}`,
    );
    return { acted: false, reason: "transferencia-fallida" };
  }
}

/**
 * Se llama tras confirmarse el pago de un pedido de dominio. Si no hay
 * pago confirmado, no hace nada. Si el registrador falla, el pago ya está
 * registrado: el fallo queda en `failureReason` y NUNCA se lanza.
 */
export async function afterDomainPayment(orderId: string): Promise<AfterDomainPaymentResult> {
  const order = (await db.customerOrder.findUnique({
    where: { id: orderId },
    include: { invoice: { include: { payment: true } } },
  })) as OrderWithPayment | null;
  if (!order) throw new CommerceError("Pedido no encontrado.", 404);
  if (!order.invoice) throw new CommerceError("Ese pedido no tiene factura.", 409);
  if (order.invoice.payment?.status !== "confirmed") {
    return { acted: false, reason: "sin-pago-confirmado" };
  }
  const actor = order.userId;
  if (order.planId === DOMAIN_PLAN_IDS.register) return runRegister(order, actor);
  if (order.planId === DOMAIN_PLAN_IDS.renewal) return runRenew(order, actor);
  if (order.planId === DOMAIN_PLAN_IDS.transfer) return runTransfer(order, actor);
  return { acted: false, reason: "no-es-pedido-de-dominio" };
}

/** Alias para renovaciones: mismo flujo que afterDomainPayment. */
export async function renewDomainFromPayment(
  orderId: string,
): Promise<AfterDomainPaymentResult> {
  return afterDomainPayment(orderId);
}

/**
 * Reintenta un registro o una transferencia pendiente con pago confirmado.
 * Las renovaciones fallidas dejan el dominio activo con `failureReason`:
 * se reintentan con un pedido de renovación nuevo, no aquí.
 */
export async function retryDomainRegistration(
  domainId: string,
  actor: string,
): Promise<unknown> {
  const row = await db.registeredDomain.findUnique({ where: { id: domainId } });
  if (!row) throw new CommerceError("Dominio no encontrado.", 404);
  if (row.status !== "pending" && row.status !== "pending_transfer") {
    throw new CommerceError(
      "Solo se reintenta un dominio pendiente o con transferencia pendiente.",
      409,
    );
  }
  if (!row.orderId) {
    throw new CommerceError("Ese dominio no tiene pedido asociado.", 409);
  }
  const order = (await db.customerOrder.findUnique({
    where: { id: row.orderId },
    include: { invoice: { include: { payment: true } } },
  })) as OrderWithPayment | null;
  if (!order || order.invoice?.payment?.status !== "confirmed") {
    throw new CommerceError("No hay pago confirmado para ese dominio.", 409);
  }
  if (row.status === "pending") return runRegister(order, actor);
  return runTransfer(order, actor);
}

/* ------------------------------ recordatorios ------------------------------ */

export const DOMAIN_REMINDER_THRESHOLDS = [30, 14, 7, 1] as const;

export type ReminderStats = { processed: number; succeeded: number; failed: number };

/**
 * Avisos de vencimiento de dominios activos que vencen en 30/14/7/1 días
 * (±1 día de tolerancia). Un aviso por dominio y umbral: solo cuenta como
 * enviado el evento con `entregado=si`; si no hay SMTP, el aviso queda
 * registrado como no entregado y reintenta al día siguiente. NUNCA cobra
 * ni renueva aquí.
 */
export async function runDomainRenewalReminders(input: { now?: Date } = {}): Promise<ReminderStats> {
  const now = input.now ?? new Date();
  const stats: ReminderStats = { processed: 0, succeeded: 0, failed: 0 };
  const details: string[] = [];
  const domains = await db.registeredDomain.findMany({
    where: { status: "active", expiresAt: { not: null } },
  });
  for (const domain of domains) {
    if (!domain.expiresAt) continue;
    const daysLeft = Math.ceil(
      (new Date(domain.expiresAt).getTime() - now.getTime()) / 86_400_000,
    );
    const threshold = DOMAIN_REMINDER_THRESHOLDS.find(
      (days) => Math.abs(daysLeft - days) <= 1,
    );
    if (threshold === undefined) continue;
    stats.processed += 1;
    try {
      const already = await db.commerceEvent.findFirst({
        where: {
          action: "domain.renewal_reminder",
          entityId: domain.id,
          details: {
            contains: `dominio=${domain.domain};umbral=${threshold};entregado=si`,
          },
        },
      });
      if (already) continue;
      const user = await db.user.findUnique({ where: { id: domain.userId } }).catch(() => null);
      if (!user?.email) {
        stats.failed += 1;
        details.push(`recordatorio ${domain.domain}: sin correo del cliente`);
        continue;
      }
      const daysWord = threshold === 1 ? "día" : "días";
      const result = await deliverNotice({
        to: user.email,
        subject: `Tu dominio ${domain.domain} vence en ${threshold} ${daysWord} — CaluServers`,
        text: [
          `Tu dominio ${domain.domain} vence en ${threshold} ${daysWord} (${new Date(domain.expiresAt).toISOString().slice(0, 10)}).`,
          "Puedes renovarlo desde tu cuenta en CaluServers. Si tienes el auto-renew activado y saldo de crédito suficiente, se renueva solo.",
        ].join("\n"),
      }).catch(() => null);
      const delivered = result?.delivered ?? false;
      await auditEvent(
        "domain.renewal_reminder",
        "domain-cron",
        domain.id,
        `dominio=${domain.domain};umbral=${threshold};entregado=${delivered ? "si" : "no"};via=${result?.reason ?? "error"}`,
      );
      if (delivered) {
        stats.succeeded += 1;
      } else {
        stats.failed += 1;
        details.push(`recordatorio ${domain.domain}: sin correo configurado`);
      }
    } catch (error) {
      stats.failed += 1;
      details.push(
        `recordatorio ${domain.domain}: ${error instanceof Error ? error.message : "error"}`,
      );
    }
  }
  await auditEvent(
    "domain.renewal_reminders_run",
    "domain-cron",
    null,
    `processed=${stats.processed};succeeded=${stats.succeeded};failed=${stats.failed}${details.length ? `;${details.join("; ")}` : ""}`,
  );
  return stats;
}

/* ------------------------------ auto-renew con crédito ------------------------------ */

export type AutoRenewResult =
  | { renewed: false; reason: string }
  | { renewed: true; order: unknown; invoice: unknown; afterPayment: AfterDomainPaymentResult };

/**
 * Auto-renew SOLO con saldo de crédito: si `autoRenew` está activado y el
 * crédito no vencido del cliente cubre el precio de renovación, crea el
 * pedido de renovación, consume el crédito dentro de una transacción,
 * registra el pago con provider "credit" y llama a afterDomainPayment.
 * Sin crédito suficiente devuelve `{renewed: false, reason: "sin-credito"}`
 * sin tocar nada. No hay tarjeta guardada: la suscripción de Stripe es de
 * hosting, no de dominios.
 */
export async function tryAutoRenewWithCredit(
  domain: { id: string; domain: string; userId: string; autoRenew: boolean; status: string; expiresAt: Date | null } | string,
  now = new Date(),
): Promise<AutoRenewResult> {
  const row =
    typeof domain === "string"
      ? await db.registeredDomain.findUnique({ where: { id: domain } })
      : domain;
  if (!row) throw new CommerceError("Dominio no encontrado.", 404);
  if (!row.autoRenew) return { renewed: false, reason: "auto-renew-desactivado" };
  if (row.status !== "active") return { renewed: false, reason: "dominio-no-activo" };
  if (!row.expiresAt) return { renewed: false, reason: "sin-vencimiento" };
  const priceRow = await getTldPrice(tldOf(row.domain));
  if (!priceRow?.active || priceRow.renewCents <= 0) {
    return { renewed: false, reason: "sin-precio" };
  }
  const credits = await db.credit.findMany({
    where: {
      userId: row.userId,
      amountCents: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  const creditTotal = credits.reduce((sum, credit) => sum + credit.amountCents, 0);
  if (creditTotal < priceRow.renewCents) {
    return { renewed: false, reason: "sin-credito" };
  }
  const created = await createDomainOrder({
    userId: row.userId,
    domain: row.domain,
    kind: "renewal",
  });
  const order = { id: created.id };
  const invoice = created.invoice;
  try {
    await db.$transaction(async (tx) => {
      const { appliedCents } = await applyCredits(tx, row.userId, invoice.totalCents, now);
      if (appliedCents < invoice.totalCents) {
        throw new CommerceError("El crédito no cubre el total de la renovación.", 409);
      }
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          currency: invoice.currency,
          amountCents: invoice.totalCents,
          status: "confirmed",
          note: "Renovación de dominio cubierta con crédito.",
          actor: "domain-cron",
          provider: "credit",
        },
      });
      await tx.customerInvoice.update({
        where: { id: invoice.id },
        data: { status: "paid" },
      });
      await tx.customerOrder.update({
        where: { id: order.id },
        data: { status: "paid" },
      });
      await tx.commerceEvent.create({
        data: {
          actor: "domain-cron",
          action: "domain.auto_renew_paid",
          entityId: invoice.id,
          details: sanitizeAudit(
            `dominio=${row.domain};cents=${invoice.totalCents};via=credito`,
          ),
        },
      });
      await writeAuditLogTx(tx, {
        actorType: "system",
        actorId: "domain-cron",
        action: "domain.auto_renew_paid",
        resourceType: "invoice",
        resourceId: invoice.id,
        details: `dominio=${row.domain};cents=${invoice.totalCents};via=credito`,
      });
    });
  } catch (error) {
    if (error instanceof CommerceError) {
      return { renewed: false, reason: "sin-credito" };
    }
    throw error;
  }
  const afterPayment = await afterDomainPayment(order.id);
  return { renewed: true, order, invoice, afterPayment };
}
