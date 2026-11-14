import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { deliverNotice, mailerConfigured } from "@/lib/mailer";
import { openSecret, sealSecret, SecretBoxError } from "@/lib/secret-box";
import { validateIdentity, whmBase, WhmError } from "@/lib/whm-security";
import { readWhm, type WhmCredentials } from "@/lib/whm-transport";
import { decryptWhm } from "@/lib/whm";
import { writeWhm } from "@/lib/whm-write";

/**
 * Alta automática de hosting en WHM después de un pago confirmado.
 *
 * Decisiones:
 * - Desactivada por defecto. Hace falta activarla y guardar un token WHM con ACL
 *   `createacct`, distinto del token de solo lectura. El de lectura no se reutiliza.
 * - Solo planes de hosting (cPanel) y solo con un dominio declarado en el pedido.
 * - La contraseña inicial no se guarda: se genera, se crea la cuenta y se envía al
 *   cliente por correo cuando hay SMTP. Sin SMTP el alta se hace igual y la
 *   contraseña queda visible en el panel del cliente y en el de administración,
 *   así que el correo nunca bloquea el alta.
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
  /** `ready` solo es cierto con credenciales, paquete y activación. El correo
   * saliente (`mailReady`) se informa aparte, pero no bloquea el alta: sin SMTP
   * la contraseña inicial se muestra en el panel del cliente y en el de
   * administración. */
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
      | "customer"
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
  state: "El servicio no se puede dar de alta en su estado actual.",
  customer: "El cliente no tiene correo registrado, así que no se puede crear la cuenta en WHM.",
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
    // El correo no bloquea: sin SMTP la contraseña se muestra en el panel.
    ready:
      enabled &&
      hasToken &&
      Boolean(row?.endpoint) &&
      (Boolean(packageName) || Object.keys(packageByPlan).length > 0),
  };
}

/**
 * Piezas que faltan para que el alta automática funcione, en lenguaje del
 * panel. Las cuatro primeras bloquean el alta; la del correo solo avisa: sin
 * SMTP la contraseña inicial no se envía, pero se muestra en el panel.
 */
export function missingProvisionPieces(config: ProvisionPublicConfig): string[] {
  const missing: string[] = [];
  if (!config.enabled) missing.push("alta desactivada");
  if (!config.url) missing.push("sin servidor WHM");
  if (!config.hasToken) missing.push("sin token WHM");
  if (!config.packageName && Object.keys(config.packageByPlan).length === 0) {
    missing.push("sin paquete WHM");
  }
  if (!config.mailReady) {
    missing.push("sin correo saliente (la contraseña se muestra en el panel)");
  }
  return missing;
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

const PASSWORD_LOWER = "abcdefghijkmnopqrstuvwxyz";
const PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PASSWORD_DIGITS = "23456789";
const PASSWORD_SYMBOLS = "!@#%^*-_=+";

/**
 * 20 caracteres a partir de los bytes de un HMAC: 5 de cada clase
 * (minúsculas, mayúsculas, dígitos, símbolos) mezclados de forma determinista.
 */
function passwordFromBytes(bytes: Buffer): string {
  const classes = [PASSWORD_LOWER, PASSWORD_UPPER, PASSWORD_DIGITS, PASSWORD_SYMBOLS];
  const chars: string[] = [];
  for (let index = 0; index < 20; index++) {
    const alphabet = classes[index % 4];
    chars.push(alphabet[bytes[index] % alphabet.length]);
  }
  for (let index = chars.length - 1; index > 0; index--) {
    const other = bytes[20 + (index % 12)] % (index + 1);
    [chars[index], chars[other]] = [chars[other], chars[index]];
  }
  return chars.join("");
}

/**
 * Contraseña inicial determinista por servicio y usuario (HMAC con
 * AUTH_SECRET). Un reintento tras una respuesta perdida regenera la MISMA
 * contraseña, así que adoptar la cuenta ya creada en WHM es seguro: la
 * contraseña que se envía al cliente es la que tiene la cuenta.
 * Nunca se guarda en ningún sitio: se envía al cliente por correo cuando hay
 * SMTP y se muestra en el panel del cliente y en el de administración.
 */
export function initialPassword(serviceId: string, username: string): string {
  const secret = process.env.AUTH_SECRET || "";
  if (secret.length < 32) throw new WhmError("key");
  for (let counter = 0; counter < 10; counter++) {
    const digest = createHmac("sha256", secret)
      .update(`hosting-password:${serviceId}:${username}:${counter}`)
      .digest();
    const password = passwordFromBytes(digest);
    if (!password.toLowerCase().includes(username.toLowerCase())) return password;
  }
  throw new WhmError("key");
}

/**
 * Contraseña inicial para mostrarla en el panel (cliente o admin). Nulo si no
 * hay usuario cPanel o no se puede calcular: la página no debe romperse por
 * esto. Nunca se registra en logs ni se mete en URLs o respuestas de error.
 */
export function initialPasswordOrNull(
  serviceId: string,
  username: string | null,
): string | null {
  if (!username) return null;
  try {
    return initialPassword(serviceId, username);
  } catch {
    return null;
  }
}

export function packageFor(config: ProvisionPublicConfig, planId: string): string {
  return config.packageByPlan[planId] || config.packageName;
}

/**
 * Cuenta que WHM ya tiene para este usuario, si existe. Se usa solo cuando el
 * alta devolvió un error incierto: si WHM creó la cuenta pero la respuesta se
 * perdió, el reintento la readopta en lugar de chocar con "el usuario ya
 * existe". Se prueba primero con las credenciales de lectura (ACL listaccts)
 * y luego con las de escritura. Con una lista truncada no se puede asegurar
 * la ausencia y no se adopta nada. Nunca lanza: sin lectura disponible, la
 * respuesta es "no consta".
 */
async function findWhmAccount(
  username: string,
): Promise<{ user: string; domain: string } | null> {
  const wanted = username.toLowerCase();
  const attempts: Array<{ endpoint: string; credentials: WhmCredentials }> = [];
  for (const id of ["whm", CONFIG_ID]) {
    try {
      const row = await db.integrationConfig.findUnique({ where: { id } });
      if (!row) continue;
      const credentials =
        id === CONFIG_ID
          ? decryptProvisionCredentials(row.encryptedCredentials)
          : decryptWhm(row.encryptedCredentials);
      attempts.push({ endpoint: row.endpoint, credentials });
    } catch {
      continue;
    }
  }
  for (const { endpoint, credentials } of attempts) {
    try {
      const { rows, truncated } = await readWhm(endpoint, credentials, "listaccts");
      const found = rows.find((entry) => (entry.user ?? "").toLowerCase() === wanted);
      if (found) return { user: found.user || username, domain: found.domain ?? "" };
      if (!truncated) return null;
    } catch {
      continue;
    }
  }
  return null;
}

/** Marca el servicio activo y entrega la contraseña inicial al cliente. */
async function finishProvision(input: {
  serviceId: string;
  createdUser: string;
  domain: string;
  planName: string;
  whmPackage: string;
  password: string;
  customerEmail: string;
  customerName: string | null;
  actor: string;
  adopted: boolean;
}): Promise<ProvisionOutcome> {
  await db.$transaction([
    db.customerService.update({
      where: { id: input.serviceId },
      data: {
        status: "active",
        cpanelUser: input.createdUser,
        provisionedAt: new Date(),
        provisionError: null,
        note: `Cuenta cPanel ${input.createdUser} creada para ${input.domain}.`,
      },
    }),
    db.commerceEvent.create({
      data: {
        actor: input.actor,
        action: "service.provisioned",
        entityId: input.serviceId,
        details: `user=${input.createdUser};domain=${input.domain};package=${input.whmPackage}${input.adopted ? ";adopted=1" : ""}`,
      },
    }),
  ]);

  let credentialsSent = false;
  try {
    const delivery = await deliverNotice({
      to: input.customerEmail,
      subject: "Tu cuenta de hosting en CaluServers está lista",
      text: [
        `Hola${input.customerName ? ` ${input.customerName}` : ""},`,
        "",
        `Tu plan ${input.planName} ya está activo para ${input.domain}.`,
        "",
        `Usuario cPanel: ${input.createdUser}`,
        `Contraseña inicial: ${input.password}`,
        "",
        "Cambia la contraseña al entrar por primera vez. Si ya la cambiaste, usa la nueva.",
        "La contraseña inicial también está en tu panel de cliente (Mis servicios).",
        "",
        "Si no reconoces este alta, responde a este correo de inmediato.",
      ].join("\n"),
    });
    credentialsSent = delivery.delivered;
  } catch {
    credentialsSent = false;
  }
  if (!credentialsSent) {
    // La cuenta existe; lo que falló es el aviso. La contraseña sigue visible
    // en el panel del cliente y en el de administración.
    await db.customerService.update({
      where: { id: input.serviceId },
      data: {
        provisionError:
          "La cuenta se creó pero el correo con la contraseña no salió. La contraseña inicial sigue visible en el panel del cliente y en el de administración.",
      },
    });
  }
  return {
    serviceId: input.serviceId,
    cpanelUser: input.createdUser,
    status: "active",
    credentialsSent,
  };
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
 *
 * Vale para un servicio pendiente de alta y para uno activo sin usuario
 * cPanel (por ejemplo, reactivado a mano o con el alta manual): en el segundo
 * caso el cerrojo se toma desde "active" y el alta lo deja activo con su
 * cuenta. Un servicio que ya tiene usuario cPanel no se vuelve a crear.
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
  // Pendiente de alta, o activo sin cuenta: un servicio reactivado a mano (o
  // activado con el alta manual) puede darse de alta después sin duplicar
  // nada; el usuario cPanel determinista y la re-adopción lo protegen.
  if (service.status !== "pending_provision" && !(service.status === "active" && !service.cpanelUser)) {
    fail("state");
  }

  const domain = service.order.domain;
  if (!domain) fail("domain");

  const config = await provisionConfiguration();
  if (!config.enabled) fail("disabled");
  if (!config.hasToken || !config.url) fail("credentials");
  const whmPackage = packageFor(config, service.planId);
  if (!whmPackage) fail("package");

  const customer = await db.user.findUnique({
    where: { id: service.userId },
    select: { email: true, name: true },
  });
  // El correo se usa como contacto de la cuenta WHM; sin él no se crea.
  // Que no haya SMTP no bloquea: la contraseña se muestra en el panel.
  if (!customer?.email) fail("customer");

  // Cerrojo: solo la llamada que cambia la fila desde su estado actual a
  // "provisioning" sigue. Para un servicio activo sin cuenta, el cerrojo se
  // toma desde "active" y el alta lo deja activo con su usuario cPanel.
  const claimed = await db.customerService.updateMany({
    where: { id: service.id, status: service.status, cpanelUser: null },
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
  const password = initialPassword(service.id, username);

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
    return await finishProvision({
      serviceId: service.id,
      createdUser: result.user || username,
      domain,
      planName: service.planName,
      whmPackage,
      password,
      customerEmail: customer.email,
      customerName: customer.name,
      actor: input.actor,
      adopted: false,
    });
  } catch (error) {
    // El alta pudo completarse aunque la respuesta se perdiera: antes de darla
    // por fallida se comprueba si WHM ya tiene la cuenta para este servicio.
    try {
      const existing = await findWhmAccount(username);
      if (existing && existing.domain.toLowerCase() === domain.toLowerCase()) {
        return await finishProvision({
          serviceId: service.id,
          createdUser: existing.user,
          domain,
          planName: service.planName,
          whmPackage,
          password,
          customerEmail: customer.email,
          customerName: customer.name,
          actor: input.actor,
          adopted: true,
        });
      }
    } catch {
      // Sin lectura disponible no se puede adoptar: cae al fallo visible.
    }
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
 *
 * Si la configuración no está lista, el alta NO se intenta, pero el salto queda
 * registrado donde el admin lo ve: un evento `service.provision_skipped` en el
 * diario y el motivo en el `provisionError` del servicio, nombrando la pieza
 * que falta. No se crea ni se provisiona nada sin pago confirmado.
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

  const invoice = await db.customerInvoice
    .findUnique({
      where: { id: input.invoiceId },
      select: { order: { select: { service: { select: { id: true } } } } },
    })
    .catch(() => null);
  const serviceId = invoice?.order?.service?.id;
  if (!serviceId) {
    return { attempted: false, provisioned: false, reason: "sin servicio asociado a la factura" };
  }

  if (!config.ready) {
    const reason = `Alta automática no intentada: falta ${missingProvisionPieces(config).join("; ")}.`;
    await recordProvisionSkipped({ serviceId, actor: input.actor, reason });
    return { attempted: false, provisioned: false, reason };
  }

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

/**
 * Deja constancia de que un cobro confirmado no disparó el alta porque la
 * configuración no está lista. Solo se registra cuando el servicio está en un
 * estado en el que el alta se habría intentado (pendiente, o activo sin
 * cuenta): un servicio que ya tiene su cuenta o está cancelado no necesita
 * este aviso. Que el registro falle nunca rompe la respuesta del cobro.
 */
async function recordProvisionSkipped(input: {
  serviceId: string;
  actor: string;
  reason: string;
}) {
  const service = await db.customerService
    .findUnique({
      where: { id: input.serviceId },
      select: { status: true, cpanelUser: true },
    })
    .catch(() => null);
  if (!service) return;
  if (service.cpanelUser) return;
  if (
    service.status !== "pending_provision" &&
    !(service.status === "active" && !service.cpanelUser)
  ) {
    return;
  }
  await db.commerceEvent
    .create({
      data: {
        actor: input.actor,
        action: "service.provision_skipped",
        entityId: input.serviceId,
        details: input.reason,
      },
    })
    .catch(() => {});
  await db.customerService
    .update({
      where: { id: input.serviceId },
      data: { provisionError: `${input.reason} Revisa la configuración en Alta automática.` },
    })
    .catch(() => {});
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
