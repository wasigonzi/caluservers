import "server-only";
import type { Prisma } from "@prisma/client";
import { sanitizeAudit } from "@/lib/audit-sanitize";
import { actorTypeFor, writeAuditLog } from "@/lib/audit-log";
import { db } from "@/lib/db";
import { openSecret, sealSecret, SecretBoxError } from "@/lib/secret-box";

export type PluginKind = "payment" | "registrar" | "panel";

export type ConfigFieldType = "text" | "password" | "select" | "number" | "textarea" | "checkbox";

export type ConfigField = {
  name: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  placeholder?: string;
  /** Opciones cuando `type` es `select`. */
  options?: { value: string; label: string }[];
  help?: string;
};

export type SecretField = {
  name: string;
  label: string;
  placeholder?: string;
  /** Si es opcional, dejarlo en blanco conserva el valor guardado. */
  required?: boolean;
};

/**
 * Manifiesto de un plugin conocido. Es la única pieza que describe al
 * plugin: las pantallas y la API se generan desde aquí, así que añadir un
 * plugin nuevo no toca ninguna pantalla (ver docs/PLUGINS.md).
 *
 * `transport` documenta dónde vive el adaptador real. El panel WHM ya
 * existe (`lib/whm-transport.ts` + `lib/whm-provision.ts`) y NO se
 * reescribe: el manifiesto solo lo registra para que el panel lo liste,
 * lo active y lo audite como los demás.
 */
export type PluginManifest = {
  key: string;
  kind: PluginKind;
  label: string;
  description: string;
  /** Configuración no secreta, editable desde el panel. */
  configSchema: ConfigField[];
  /** Credenciales: solo se guardan cifradas; nunca se devuelven. */
  secretFields: SecretField[];
  capabilities: string[];
  /** Dónde vive el adaptador (o "pendiente" si aún no existe). */
  transport: string;
};

export const PLUGIN_MANIFESTS: PluginManifest[] = [
  {
    key: "stripe",
    kind: "payment",
    label: "Stripe",
    description:
      "Cobro con tarjeta y suscripciones (Stripe Billing). Sin la clave secreta guardada, el plugin no puede cobrar.",
    configSchema: [
      {
        name: "mode",
        label: "Modo",
        type: "select",
        required: true,
        options: [
          { value: "sandbox", label: "Pruebas (sandbox)" },
          { value: "live", label: "Producción (live)" },
        ],
        help: "En pruebas no se cobra de verdad.",
      },
      {
        name: "publishableKey",
        label: "Clave publicable",
        type: "text",
        required: false,
        placeholder: "pk_test_… o pk_live_…",
        help: "Opcional: solo se usa si el cobro se confirma en el navegador.",
      },
    ],
    secretFields: [
      { name: "secretKey", label: "Clave secreta", placeholder: "sk_test_… o sk_live_…", required: true },
      { name: "webhookSecret", label: "Secreto del webhook", placeholder: "whsec_…", required: false },
    ],
    capabilities: ["checkout", "refund", "recurring"],
    transport: "pendiente (lo implementa el frente B de la Fase 2)",
  },
  {
    key: "paypal",
    kind: "payment",
    label: "PayPal",
    description:
      "Cobro con PayPal. Mientras no se guarden credenciales aquí, sigue mandando la configuración por variables de entorno (PAYPAL_*).",
    configSchema: [
      {
        name: "mode",
        label: "Modo",
        type: "select",
        required: true,
        options: [
          { value: "sandbox", label: "Pruebas (sandbox)" },
          { value: "live", label: "Producción (live)" },
        ],
      },
    ],
    secretFields: [
      { name: "clientId", label: "Client ID", placeholder: "ID de la app de PayPal", required: true },
      { name: "clientSecret", label: "Client Secret", placeholder: "Secreto de la app de PayPal", required: true },
      { name: "webhookId", label: "Webhook ID", placeholder: "ID del webhook (opcional)", required: false },
    ],
    capabilities: ["checkout", "refund"],
    transport: "lib/paypal.ts + lib/paypal-checkout.ts (existentes; la lectura del registro llega con el frente B)",
  },
  {
    key: "bank_transfer",
    kind: "payment",
    label: "Transferencia bancaria",
    description:
      "Pago manual: el cliente ve las instrucciones en su factura y tú confirmas el cobro a mano. No lleva credenciales.",
    configSchema: [],
    secretFields: [],
    capabilities: ["manual"],
    transport: "lib/billing-settings.ts (instrucciones) + confirmación manual en Pedidos y facturas",
  },
  {
    key: "whm",
    kind: "panel",
    label: "WHM / cPanel",
    description:
      "Alta, suspensión y baja de cuentas cPanel. Las credenciales se gestionan en «Conexión WHM», no aquí.",
    configSchema: [
      {
        name: "host",
        label: "Servidor WHM",
        type: "text",
        required: false,
        placeholder: "https://servidor:2087",
        help: "Informativo: la conexión real se configura en «Conexión WHM».",
      },
    ],
    secretFields: [],
    capabilities: ["create", "suspend", "terminate", "list"],
    transport: "lib/whm-transport.ts + lib/whm-provision.ts (existentes, no se reescriben)",
  },
  {
    key: "plesk",
    kind: "panel",
    label: "Plesk",
    description:
      "Alta, suspensión y baja de cuentas Plesk por API-RPC (puerto 8443). Doble cerrojo: sin PLESK_ENABLED=true y sin el plugin activo, no hace nada y las operaciones responden 503. La suspensión desactiva las suscripciones del cliente, no su login. Ver docs/PANELES.md.",
    configSchema: [
      {
        name: "url",
        label: "URL del servidor Plesk",
        type: "text",
        required: true,
        placeholder: "https://servidor:8443",
        help: "Solo el origen https con su puerto (8443 por defecto). El servidor debe tener un certificado TLS válido y resolver a una IP pública.",
      },
      {
        name: "mode",
        label: "Autenticación",
        type: "select",
        required: true,
        options: [
          { value: "login", label: "Usuario y contraseña" },
          { value: "secret-key", label: "Clave secreta (KEY)" },
        ],
        help: "La clave secreta va ligada a una IP de origen: desde Vercel la IP de salida varía, así que normalmente conviene usuario y contraseña.",
      },
      {
        name: "ipAddress",
        label: "IP del servidor para las altas",
        type: "text",
        required: false,
        placeholder: "203.0.113.10",
        help: "Plesk exige una IP al crear la suscripción. Sin ella, el alta falla con un error claro.",
      },
    ],
    secretFields: [
      { name: "login", label: "Usuario (admin)", placeholder: "admin", required: false },
      { name: "password", label: "Contraseña", placeholder: "Contraseña del admin", required: false },
      { name: "secretKey", label: "Clave secreta (KEY)", placeholder: "UUID de la clave secreta", required: false },
    ],
    capabilities: ["create", "suspend", "terminate", "list", "packages", "change-package"],
    transport: "lib/plesk.ts",
  },
  {
    key: "directadmin",
    kind: "panel",
    label: "DirectAdmin",
    description:
      "Alta, suspensión y baja de usuarios DirectAdmin por API legacy (puerto 2222). Doble cerrojo: sin DIRECTADMIN_ENABLED=true y sin el plugin activo, no hace nada y las operaciones responden 503. El cambio de paquete no va por API: se hace en el panel de DirectAdmin. Ver docs/PANELES.md.",
    configSchema: [
      {
        name: "url",
        label: "URL del servidor DirectAdmin",
        type: "text",
        required: true,
        placeholder: "https://servidor:2222",
        help: "Solo el origen https con su puerto (2222 por defecto). El servidor debe tener un certificado TLS válido y resolver a una IP pública.",
      },
      {
        name: "ipAddress",
        label: "IP del servidor para las altas",
        type: "text",
        required: false,
        placeholder: "203.0.113.10",
        help: "DirectAdmin exige una IP libre o compartida al crear el usuario. Sin ella, el alta falla con un error claro.",
      },
    ],
    secretFields: [
      { name: "login", label: "Usuario (admin o reseller)", placeholder: "admin", required: true },
      { name: "password", label: "Contraseña o clave de acceso (login key)", placeholder: "Contraseña o login key", required: true },
    ],
    capabilities: ["create", "suspend", "terminate", "list", "packages"],
    transport: "lib/directadmin.ts",
  },
  {
    key: "porkbun",
    kind: "registrar",
    label: "Porkbun",
    description:
      "Registrador de dominios por API (v3). Sin las claves API guardadas, el plugin no registra nada: las rutas responden 503. Los precios de venta salen de TldPrice, nunca se inventan.",
    configSchema: [
      {
        name: "mode",
        label: "Modo",
        type: "select",
        required: true,
        options: [
          { value: "sandbox", label: "Pruebas (sandbox, claves pk1_sb_/sk1_sb_)" },
          { value: "live", label: "Producción (live)" },
        ],
        help: "El sandbox usa las mismas URLs con crédito falso; no registra dominios reales.",
      },
    ],
    secretFields: [
      { name: "apiKey", label: "Clave API", placeholder: "pk1_… o pk1_sb_…", required: true },
      { name: "secretKey", label: "Clave secreta API", placeholder: "sk1_… o sk1_sb_…", required: true },
    ],
    capabilities: ["check", "register", "renew", "transfer", "nameservers"],
    transport: "lib/porkbun.ts",
  },
  {
    key: "godaddy",
    kind: "registrar",
    label: "GoDaddy",
    description:
      "Registrador GoDaddy. Solo el manifiesto por ahora: el adaptador no existe y no se puede usar para registrar, renovar ni transferir.",
    configSchema: [
      {
        name: "mode",
        label: "Modo",
        type: "select",
        required: true,
        options: [
          { value: "sandbox", label: "Pruebas (sandbox)" },
          { value: "live", label: "Producción (live)" },
        ],
      },
    ],
    secretFields: [
      { name: "apiKey", label: "Clave API", placeholder: "Clave API de GoDaddy", required: true },
      { name: "secretKey", label: "Clave secreta API", placeholder: "Secreto de GoDaddy", required: true },
    ],
    capabilities: ["check"],
    transport: "pendiente (esqueleto: solo manifiesto; el adaptador no existe)",
  },
];

export function getManifest(key: string): PluginManifest | null {
  return PLUGIN_MANIFESTS.find((manifest) => manifest.key === key) ?? null;
}

/** AAD por plugin: un secreto cifrado para un plugin no vale para otro. */
export function pluginAad(key: string): string {
  return `plugin:${key}:v1`;
}

export class PluginError extends Error {
  constructor(
    message: string,
    readonly code: "not-found" | "unknown-plugin" | "invalid-config" | "invalid-secrets" | "secret-unreadable",
  ) {
    super(message);
    this.name = "PluginError";
  }
}

/** Vista pública de un plugin: nunca incluye secretos ni su referencia. */
export type PluginPublicView = {
  key: string;
  kind: PluginKind | string;
  label: string;
  enabled: boolean;
  config: Record<string, unknown>;
  hasSecrets: boolean;
  lastRotatedAt: Date | null;
  manifest: PluginManifest | null;
};

type PluginRow = {
  key: string;
  kind: string;
  label: string;
  enabled: boolean;
  configJson: unknown;
  secretRef: string | null;
  lastRotatedAt: Date | null;
};

function publicView(row: PluginRow): PluginPublicView {
  const config =
    row.configJson && typeof row.configJson === "object" && !Array.isArray(row.configJson)
      ? (row.configJson as Record<string, unknown>)
      : {};
  return {
    key: row.key,
    kind: row.kind,
    label: row.label,
    enabled: row.enabled,
    config,
    hasSecrets: Boolean(row.secretRef),
    lastRotatedAt: row.lastRotatedAt,
    manifest: getManifest(row.key),
  };
}

function toRow(record: {
  key: string;
  kind: string;
  label: string;
  enabled: boolean;
  configJson: unknown;
  secretRef: string | null;
  lastRotatedAt: Date | null;
}): PluginRow {
  return record;
}

async function auditPlugin(action: string, actor: string | undefined, key: string, extra?: string): Promise<void> {
  try {
    await db.adminAudit.create({
      data: {
        action,
        entityId: key,
        details: sanitizeAudit({
          action,
          actor: actor ?? "admin",
          provider: key,
          ...(extra ? { reason: extra } : {}),
        }),
      },
    });
    // Doble escritura (Fase 6): también a AuditLog.
    await writeAuditLog({
      actorType: actorTypeFor(actor ?? "admin"),
      actorId: actor ?? "admin",
      action,
      resourceType: "plugin",
      resourceId: key,
      details: {
        action,
        actor: actor ?? "admin",
        provider: key,
        ...(extra ? { reason: extra } : {}),
      },
    });
  } catch {
    // La auditoría no puede tumbar la operación.
  }
}

/** Todos los plugins de la base, con su manifiesto. Filas sin manifiesto conocido también se listan. */
export async function listPlugins(): Promise<PluginPublicView[]> {
  const rows = await db.plugin.findMany({ orderBy: { key: "asc" } });
  return rows.map((row) => publicView(toRow(row)));
}

/** Un plugin por clave, o null si no existe en la base. */
export async function getPlugin(key: string): Promise<PluginPublicView | null> {
  const row = await db.plugin.findUnique({ where: { key } });
  return row ? publicView(toRow(row)) : null;
}

/** false si el plugin no existe o está desactivado. */
export async function isPluginEnabled(key: string): Promise<boolean> {
  const row = await db.plugin.findUnique({ where: { key }, select: { enabled: true } });
  return row?.enabled ?? false;
}

/** Configuración no secreta guardada (vacía si no hay nada). */
export async function getPluginConfig(key: string): Promise<Record<string, unknown>> {
  const row = await db.plugin.findUnique({ where: { key }, select: { configJson: true } });
  const value = row?.configJson;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Secretos descifrados del plugin, o null si nunca se guardaron.
 * Si el secreto no descifra (clave cambiada, AAD distinto, dato corrupto),
 * lanza PluginError con un mensaje genérico: el valor nunca se filtra.
 */
export async function getPluginSecrets(key: string): Promise<Record<string, string> | null> {
  const row = await db.plugin.findUnique({ where: { key }, select: { secretRef: true } });
  if (!row?.secretRef) return null;
  let plaintext: string;
  try {
    plaintext = openSecret(pluginAad(key), row.secretRef);
  } catch (error) {
    if (error instanceof SecretBoxError) {
      throw new PluginError(
        "No se pudo descifrar los secretos de este plugin. Vuelve a guardarlos.",
        "secret-unreadable",
      );
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new PluginError(
      "No se pudo descifrar los secretos de este plugin. Vuelve a guardarlos.",
      "secret-unreadable",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PluginError(
      "No se pudo descifrar los secretos de este plugin. Vuelve a guardarlos.",
      "secret-unreadable",
    );
  }
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string") out[name] = value;
  }
  return out;
}

/**
 * Cifra y guarda los secretos de un plugin. Solo se guardan los campos
 * conocidos del manifiesto con valor no vacío; un campo vacío conserva el
 * valor anterior. Actualiza `lastRotatedAt` y audita el cambio (sin valores).
 */
export async function setPluginSecrets(
  key: string,
  secrets: Record<string, unknown>,
  actor?: string,
): Promise<void> {
  const manifest = getManifest(key);
  if (!manifest) throw new PluginError(`Plugin desconocido: ${key}.`, "unknown-plugin");
  const known = new Set(manifest.secretFields.map((field) => field.name));
  for (const name of Object.keys(secrets)) {
    if (!known.has(name)) {
      throw new PluginError(`Campo secreto no reconocido: ${name}.`, "invalid-secrets");
    }
  }
  const previous = await getPluginSecrets(key).catch((error) => {
    if (error instanceof PluginError && error.code === "secret-unreadable") return {};
    throw error;
  });
  const merged: Record<string, string> = { ...(previous ?? {}) };
  let changed = false;
  for (const field of manifest.secretFields) {
    const value = secrets[field.name];
    if (typeof value === "string" && value.trim() !== "") {
      merged[field.name] = value.trim();
      changed = true;
    } else if (field.required && !merged[field.name]) {
      throw new PluginError(`Falta el secreto obligatorio: ${field.label}.`, "invalid-secrets");
    }
  }
  if (!changed) {
    // Sin secretos previos y todo vacío: no hay nada que guardar.
    if (Object.keys(merged).length === 0) {
      throw new PluginError("No se guardó ningún secreto: todos los campos estaban vacíos.", "invalid-secrets");
    }
    // Con secretos previos y todo vacío: conserva sin tocar la rotación.
    return;
  }
  const row = await db.plugin.findUnique({ where: { key }, select: { id: true } });
  if (!row) throw new PluginError(`Plugin no encontrado: ${key}.`, "not-found");
  await db.plugin.update({
    where: { key },
    data: {
      secretRef: sealSecret(pluginAad(key), JSON.stringify(merged)),
      lastRotatedAt: new Date(),
    },
  });
  await auditPlugin("plugin.secrets_saved", actor, key);
}

/**
 * Valida y normaliza una configuración contra el `configSchema` del
 * manifiesto. Los campos desconocidos se descartan; los obligatorios
 * vacíos y los `select` fuera de lista son error.
 */
export function validatePluginConfig(
  manifest: PluginManifest,
  input: unknown,
): { config: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const config: Record<string, unknown> = {};
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  for (const field of manifest.configSchema) {
    const value = raw[field.name];
    if (field.type === "checkbox") {
      config[field.name] = value === true || value === "true" || value === "on";
      continue;
    }
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      if (field.required) errors.push(`Falta el campo obligatorio: ${field.label}.`);
      continue;
    }
    if (field.type === "select") {
      const allowed = (field.options ?? []).map((option) => option.value);
      if (typeof value !== "string" || !allowed.includes(value)) {
        errors.push(`Valor no válido para ${field.label}: debe ser uno de ${allowed.join(", ")}.`);
        continue;
      }
      config[field.name] = value;
      continue;
    }
    if (field.type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        errors.push(`Valor no válido para ${field.label}: debe ser un número.`);
        continue;
      }
      config[field.name] = number;
      continue;
    }
    if (typeof value !== "string") {
      errors.push(`Valor no válido para ${field.label}: debe ser texto.`);
      continue;
    }
    config[field.name] = value.trim();
  }
  return { config, errors };
}

/** Guarda la configuración no secreta de un plugin (validada en servidor). */
export async function updatePluginConfig(
  key: string,
  input: unknown,
  actor?: string,
): Promise<Record<string, unknown>> {
  const manifest = getManifest(key);
  if (!manifest) throw new PluginError(`Plugin desconocido: ${key}.`, "unknown-plugin");
  const { config, errors } = validatePluginConfig(manifest, input);
  if (errors.length) {
    throw new PluginError(errors.join(" "), "invalid-config");
  }
  const row = await db.plugin.findUnique({ where: { key }, select: { id: true } });
  if (!row) throw new PluginError(`Plugin no encontrado: ${key}.`, "not-found");
  await db.plugin.update({ where: { key }, data: { configJson: config as Prisma.InputJsonValue } });
  await auditPlugin("plugin.config_saved", actor, key);
  return config;
}

/** Activa o desactiva un plugin. Desactivar no borra ni la config ni los secretos. */
export async function setPluginEnabled(key: string, enabled: boolean, actor?: string): Promise<void> {
  const row = await db.plugin.findUnique({ where: { key }, select: { id: true } });
  if (!row) throw new PluginError(`Plugin no encontrado: ${key}.`, "not-found");
  await db.plugin.update({ where: { key }, data: { enabled } });
  await auditPlugin("plugin.toggled", actor, key, enabled ? "enabled" : "disabled");
}
