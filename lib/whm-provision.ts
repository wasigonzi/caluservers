import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { deliverNotice, mailerConfigured } from "@/lib/mailer";
import { openSecret, sealSecret, SecretBoxError } from "@/lib/secret-box";
import { validateIdentity, whmBase, WhmError } from "@/lib/whm-security";
import type { WhmCredentials } from "@/lib/whm-transport";
import { writeWhm } from "@/lib/whm-write";

/**
 * Alta automática de hosting en WHM después de un pago confirmado.
 *
 * Decisiones:
 * - Desactivada por defecto. Hace falta activarla y guardar un token WHM con ACL
 *   `createacct`, distinto del token de solo lectura. El de lectura no se reutiliza.
 * - Solo planes de hosting (cPanel) y solo con un dominio declarado en el pedido.
 * - La contraseña inicial no se guarda: se genera, se crea la cuenta y se envía al
 *   cliente. Sin SMTP configurado no se da de alta, porque no habría forma de
 *   entregarla.
 * - El usuario cPanel es determinista por servicio: un reintento usa el mismo
 *   nombre, así que no se crean dos cuentas para el mismo pedido.
 * - `status = "provisioning"` es un cerrojo en base: solo una llamada lo toma.
 */

const PROVISION_AAD = "caluservers:whm-provision:v1";
const CONFIG_ID = "whm-provision";
const SETTING_ID = "whm";
const PACKAGE_RE = /^[A-Za-z0-9][A-Za-z0-9_.\- ]{0,62}[A-Za-z0-9]$|^[A-Za-z0-9]$/;
/** Nombres que cPanel reserva o rechaza como usuario. */
const RESERVED_USERS = new Set([
  "root",
  "admin",
  "cpanel",
  "test",
  "mysql",
  "nobody",
  "ftp",
  "mail",
  "www",
  "whm",
  "system",
]);

export type ProvisionPublicConfig = {
  url: string;
  username: string;
  hasToken: boolean;
  enabled: boolean;
  packageName: string;
  packageByPlan: Record<string, string>;
  /** `ready` solo es cierto con credenciales, paquete, activación y correo salientes. */
  ready: boolean;
  mailReady: boolean;
};

export class ProvisionError extends Error {
  constructor(
    readonly code:
      | "disabled"
      | "credentials"
      | "package"
      | "domain"
      | "unpaid"
      | "state"
      | "mail"
      | "plan"
      | "notfound",
    message: string,
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}

const MESSAGES = {
  disabled: "El alta automática está desactivada en el panel.",
  credentials: "Falta el servidor WHM o el token con permiso de creación de cuentas.",
  package: "Falta el paquete WHM para ese plan.",
  domain: "El pedido no declara un dominio, así que no se puede crear la cuenta.",
  unpaid: "No se da de alta un servicio sin pago confirmado.",
  state: "Ese servicio no está pendiente de alta.",
  mail: "Sin SMTP configurado no se puede entregar la contraseña inicial.",
  plan: "Ese plan no se da de alta en cPanel.",
  notfound: "Servicio no encontrado.",
} as const;

function fail(code: ProvisionError["code"]): never {
  throw new ProvisionError(code, MESSAGES[code]);
}

/* ------------------------------ configuración ------------------------------ */

export function encryptProvisionCredentials(credentials: WhmCredentials): string {
  try {
    return sealSecret(PROVISION_AAD, JSON.stringify(credentials));
  } catch (error) {
    throw error instanceof SecretBoxError ? new WhmError("key") : error;
  }
}

export function decryptProvisionCredentials(value: string): WhmCredentials {
  try {
    const credentials = JSON.parse(openSecret(PROVISION_AAD, value));
    if (typeof credentials.username !== "string" || typeof credentials.token !== "string") {
      throw new WhmError("storage");
    }
    validateIdentity(credentials.username, credentials.token);
    return credentials;
  } catch (error) {
    if (error instanceof WhmError) throw error;
    throw new WhmError(
      error instanceof SecretBoxError && error.code === "key" ? "key" : "storage",
    );
  }
}

export function parsePackageMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [plan, pkg] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(plan)) continue;
    if (typeof pkg === "string" && PACKAGE_RE.test(pkg.trim())) out[plan] = pkg.trim();
  }
  return out;
}

export async function provisionConfiguration(): Promise<ProvisionPublicConfig> {
  const [row, setting] = await Promise.all([
    db.integrationConfig.findUnique({ where: { id: CONFIG_ID } }),
    db.provisionSetting.findUnique({ where: { id: SETTING_ID } }),
  ]);
  const credentials = row ? decryptProvisionCredentials(row.encryptedCredentials) : null;
  const packageName = setting?.packageName?.trim() ?? "";
  const packageByPlan = parsePackageMap(setting?.packageByPlan);
  const enabled = Boolean(setting?.enabled);
  const hasToken = Boolean(credentials?.token);
  const mailReady = mailerConfigured();
  return {
    url: row?.endpoint ?? "",
    username: credentials?.username ?? "",
    hasToken,
    enabled,
    packageName,
    packageByPlan,
    mailReady,
    ready:
      enabled &&
      hasToken &&
      Boolean(row?.endpoint) &&
      (Boolean(packageName) || Object.keys(packageByPlan).length > 0) &&
      mailReady,
  };
}

export async function saveProvisionConfiguration(input: unknown): Promise<ProvisionPublicConfig> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new WhmError("invalid");
  const value = input as Record<string, unknown>;
  const allowed = ["url", "username", "token", "enabled", "packageName", "packageByPlan"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new WhmError("invalid");
  if (
    typeof value.url !== "string" ||
    value.url.length > 300 ||
    typeof value.username !== "string" ||
    (value.token !== undefined && typeof value.token !== "string") ||
    typeof value.enabled !== "boolean" ||
    typeof value.packageName !== "string"
  ) {
    throw new WhmError("invalid");
  }
  const packageName = value.packageName.trim();
  if (packageName && !PACKAGE_RE.test(packageName)) throw new WhmError("invalid");
  const packageByPlan = parsePackageMap(value.packageByPlan);

  const endpoint = whmBase(value.url);
  const username = value.username.trim();
  const supplied = typeof value.token === "string" ? value.token : "";
  validateIdentity(username, supplied);

  const previous = await db.integrationConfig.findUnique({ where: { id: CONFIG_ID } });
  const kept = previous ? decryptProvisionCredentials(previous.encryptedCredentials) : null;
  // Cambiar servidor o usuario exige volver a escribir el token: no se traslada.
  if (!supplied && kept?.token && (previous?.endpoint !== endpoint || kept.username !== username)) {
    throw new WhmError("identity");
  }
  const credentials: WhmCredentials = {
    username,
    token: supplied || kept?.token || "",
  };
  if (value.enabled && !credentials.token) throw new WhmError("pending");

  const encryptedCredentials = encryptProvisionCredentials(credentials);
  await db.$transaction([
    db.integrationConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, endpoint, encryptedCredentials },
      update: { endpoint, encryptedCredentials },
    }),
    db.provisionSetting.upsert({
      where: { id: SETTING_ID },
      create: {
        id: SETTING_ID,
        enabled: value.enabled,
        packageName,
        packageByPlan,
      },
      update: { enabled: value.enabled, packageName, packageByPlan },
    }),
    db.adminAudit.create({
      data: {
        action: "whm.provision.updated",
        details: `WHM provisioning ${value.enabled ? "enabled" : "disabled"}; secrets omitted`,
      },
    }),
  ]);
  return provisionConfiguration();
}

/* --------------------------- identidad de la cuenta --------------------------- */

/**
 * Usuario cPanel determinista para un servicio: 8 caracteres, empieza por letra.
 * El mismo servicio siempre da el mismo usuario, así que un reintento no abre
 * una segunda cuenta.
 */
export function cpanelUsername(serviceId: string, domain: string): string {
  const secret = process.env.AUTH_SECRET || "";
  if (secret.length < 32) throw new WhmError("key");
  const letters = domain.replace(/[^a-z]/gi, "").toLowerCase();
  const head = (letters[0] ?? "c") + letters.slice(1, 3).padEnd(2, "x");
  const digest = createHmac("sha256", secret).update(`cpanel:${serviceId}`).digest("hex");
  const tail = BigInt(`0x${digest.slice(0, 16)}`).toString(36).padStart(5, "0").slice(-5);
  const candidate = `${head}${tail}`.slice(0, 8).toLowerCase();
  return RESERVED_USERS.has(candidate) ? `c${candidate.slice(1)}` : candidate;
}

const PASSWORD_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_SYMBOLS = "!@#%^*-_=+";

/** Contraseña inicial fuerte. No se guarda en ningún sitio: solo se envía al cliente. */
export function initialPassword(): string {
  const chars: string[] = [];
  for (let index = 0; index < 20; index++) {
    chars.push(PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]);
  }
  chars[randomInt(chars.length)] = PASSWORD_SYMBOLS[randomInt(PASSWORD_SYMBOLS.length)];
  return chars.join("");
}

export function packageFor(config: ProvisionPublicConfig, planId: string): string {
  return config.packageByPlan[planId] || config.packageName;
}

/* ------------------------------- alta efectiva ------------------------------- */

export type ProvisionOutcome = {
  serviceId: string;
  cpanelUser: string;
  status: "active";
  /** Falso si la cuenta se creó pero el correo con la contraseña no salió. */
  credentialsSent: boolean;
};

/**
 * Da de alta el servicio en WHM. Devuelve el resultado o lanza `ProvisionError`
 * con un motivo que el panel puede mostrar. No reintenta por su cuenta.
 */
export async function provisionService(input: {
  serviceId: string;
  actor: string;
}): Promise<ProvisionOutcome> {
  const service = await db.customerService.findUnique({
    where: { id: input.serviceId },
    include: {
      order: { include: { invoice: { include: { payment: true } } } },
      // El correo del cliente vive en la cuenta, no en el servicio.
    },
  });
  if (!service) fail("notfound");
  if (service.cpanelUser) {
    // Ya existe la cuenta: no se vuelve a crear.
    return {
      serviceId: service.id,
      cpanelUser: service.cpanelUser,
      status: "active",
      credentialsSent: true,
    };
  }
  if (service.order.invoice?.payment?.status !== "confirmed") fail("unpaid");
  if (service.status !== "pending_provision") fail("state");

  const domain = service.order.domain;
  if (!domain) fail("domain");

  const config = await provisionConfiguration();
  if (!config.enabled) fail("disabled");
  if (!config.hasToken || !config.url) fail("credentials");
  if (!config.mailReady) fail("mail");
  const whmPackage = packageFor(config, service.planId);
  if (!whmPackage) fail("package");

  const customer = await db.user.findUnique({
    where: { id: service.userId },
    select: { email: true, name: true },
  });
  if (!customer?.email) fail("mail");

  // Cerrojo: solo la llamada que cambia la fila de pendiente a "provisioning" sigue.
  const claimed = await db.customerService.updateMany({
    where: { id: service.id, status: "pending_provision", cpanelUser: null },
    data: {
      status: "provisioning",
      provisionAttempts: { increment: 1 },
      provisionError: null,
      note: "Alta en curso en WHM.",
    },
  });
  if (claimed.count !== 1) fail("state");

  const row = await db.integrationConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row) {
    await releaseLock(service.id, "credentials");
    fail("credentials");
  }
  const credentials = decryptProvisionCredentials(row.encryptedCredentials);
  const username = cpanelUsername(service.id, domain);
  const password = initialPassword();

  try {
    const result = await writeWhm(row.endpoint, credentials, "createacct", {
      username,
      domain,
      plan: whmPackage,
      password,
      contactemail: customer.email,
      useregns: "0",
      reseller: "0",
    });
    const created = result.user || username;

    await db.$transaction([
      db.customerService.update({
        where: { id: service.id },
        data: {
          status: "active",
          cpanelUser: created,
          provisionedAt: new Date(),
          provisionError: null,
          note: `Cuenta cPanel ${created} creada para ${domain}.`,
        },
      }),
      db.commerceEvent.create({
        data: {
          actor: input.actor,
          action: "service.provisioned",
          entityId: service.id,
          details: `user=${created};domain=${domain};package=${whmPackage}`,
        },
      }),
    ]);

    let credentialsSent = false;
    try {
      const delivery = await deliverNotice({
        to: customer.email,
        subject: "Tu cuenta de hosting en CaluServers está lista",
        text: [
          `Hola${customer.name ? ` ${customer.name}` : ""},`,
          "",
          `Tu plan ${service.planName} ya está activo para ${domain}.`,
          "",
          `Usuario cPanel: ${created}`,
          `Contraseña inicial: ${password}`,
          "",
          "Cambia la contraseña al entrar por primera vez. No guardamos esta contraseña,",
          "así que este es el único mensaje que la contiene.",
          "",
          "Si no reconoces este alta, responde a este correo de inmediato.",
        ].join("\n"),
      });
      credentialsSent = delivery.delivered;
    } catch {
      credentialsSent = false;
    }
    if (!credentialsSent) {
      // La cuenta existe; lo que falló es el aviso. El panel lo muestra para actuar.
      await db.customerService.update({
        where: { id: service.id },
        data: {
          provisionError:
            "La cuenta se creó pero el correo con la contraseña no salió. Restablece la contraseña desde WHM y entrégala tú.",
        },
      });
    }
    return { serviceId: service.id, cpanelUser: created, status: "active", credentialsSent };
  } catch (error) {
    const code = error instanceof WhmError ? error.code : "network";
    await releaseLock(service.id, code);
    await db.commerceEvent
      .create({
        data: {
          actor: input.actor,
          action: "service.provision_failed",
          entityId: service.id,
          details: `code=${code};domain=${domain}`,
        },
      })
      .catch(() => {});
    throw error;
  }
}

/**
 * Intento de alta justo después de un cobro, sin romper la respuesta del pago.
 *
 * Se llama fuera de la transacción del cobro: una llamada de red dentro de una
 * transacción la mantendría abierta. Si el alta no sale, el pago sigue registrado
 * y el servicio queda pendiente con su motivo, listo para reintentar desde el panel.
 */
export async function maybeAutoProvision(input: {
  invoiceId: string;
  actor: string;
}): Promise<{ attempted: boolean; provisioned: boolean; reason?: string }> {
  let config: ProvisionPublicConfig;
  try {
    config = await provisionConfiguration();
  } catch {
    return { attempted: false, provisioned: false, reason: "configuración no disponible" };
  }
  if (!config.ready) return { attempted: false, provisioned: false };

  const invoice = await db.customerInvoice
    .findUnique({
      where: { id: input.invoiceId },
      select: { order: { select: { service: { select: { id: true } } } } },
    })
    .catch(() => null);
  const serviceId = invoice?.order?.service?.id;
  if (!serviceId) return { attempted: false, provisioned: false };

  try {
    await provisionService({ serviceId, actor: input.actor });
    return { attempted: true, provisioned: true };
  } catch (error) {
    const reason =
      error instanceof ProvisionError || error instanceof WhmError
        ? error.message
        : "El alta automática no se completó.";
    return { attempted: true, provisioned: false, reason };
  }
}

/** Devuelve el servicio a pendiente con el motivo saneado, para poder reintentar. */
async function releaseLock(serviceId: string, code: string) {
  await db.customerService
    .update({
      where: { id: serviceId },
      data: {
        status: "pending_provision",
        provisionError: `El alta en WHM no se completó (${code}). Revisa la conexión y los permisos del token, y reintenta.`,
        note: "Pago confirmado. El alta automática no se completó.",
      },
    })
    .catch(() => {});
}
