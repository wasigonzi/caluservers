// Aprovisionamiento automático de hosting al confirmar el pago.
//
// Flujo: pedido (pending_payment) --confirmar pago--> paid --aprovisionar-->
// active (cuenta cPanel creada en WHM) o provision_failed (con error visible
// y reintento). La confirmación puede venir del admin o del webhook de pago
// (PAYMENT_WEBHOOK_SECRET); el aprovisionamiento es el mismo en ambos casos.
//
// Idempotencia: confirmar el mismo pago dos veces nunca crea una segunda
// cuenta. La reclamación de estado es atómica (updateMany condicional) y la
// contraseña de hosting es determinista por pedido+usuario (HMAC con la clave
// de cifrado del servidor), así que un reintento tras un fallo "incierto"
// readopta la cuenta ya creada en WHM en lugar de duplicarla.
//
// Nada aquí llama a un WHM real sin credenciales configuradas: sin
// IntegrationConfig "whm" el aprovisionamiento falla con "pending" y el
// pedido queda en provision_failed con el error visible para reintentar.
import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { db } from "@/lib/db";
import { manageWhm } from "@/lib/whm-management";
import { decryptWhm } from "@/lib/whm";
import { readWhm } from "@/lib/whm-transport";
import { safeWhmError, WhmError } from "@/lib/whm-security";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "provisioning"
  | "active"
  | "provision_failed"
  | "cancelled";

export type OrderRecord = {
  id: string;
  number: string;
  lookupToken: string;
  customerName: string;
  customerEmail: string;
  domain: string;
  planId: string;
  planName: string;
  planCategory: string;
  price: string;
  status: string;
  paymentRef: string | null;
  paidAt: Date | null;
  paidVia: string | null;
  whmUsername: string | null;
  whmPackage: string | null;
  provisionAttempts: number;
  provisionError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewOrderData = {
  customerName: string;
  customerEmail: string;
  domain: string;
  planId: string;
  planName: string;
  planCategory: string;
  price: string;
  whmPackage: string;
};

/** Acceso a datos del pedido. La implementación Prisma vive aquí; los tests
 *  inyectan un almacén en memoria con la misma interfaz. */
export interface OrderStore {
  findById(id: string): Promise<OrderRecord | null>;
  findByNumber(number: string): Promise<OrderRecord | null>;
  findByLookupToken(token: string): Promise<OrderRecord | null>;
  findPendingDuplicate(
    email: string,
    domain: string,
    planId: string,
  ): Promise<OrderRecord | null>;
  create(data: NewOrderData & { number: string }): Promise<OrderRecord>;
  /** Reclama el pago: solo si sigue pending_payment. null = ya confirmado. */
  claimPaid(
    id: string,
    paymentRef: string | null,
    paidVia: string,
  ): Promise<OrderRecord | null>;
  /** Reclama el aprovisionamiento: solo si está paid. null = otro ganó. */
  claimProvisioning(id: string): Promise<OrderRecord | null>;
  markActive(id: string, whmUsername: string): Promise<OrderRecord>;
  markFailed(id: string, error: string): Promise<OrderRecord>;
  /** Vuelve a paid solo desde provision_failed (reintento). */
  resetToPaid(id: string): Promise<OrderRecord | null>;
  createHostingAccount(data: {
    orderId: string;
    whmUsername: string;
    domain: string;
    package: string;
    encryptedPassword: string;
  }): Promise<void>;
  usernameTaken(username: string, exceptOrderId?: string): Promise<boolean>;
}

function toRecord(order: {
  id: string;
  number: string;
  lookupToken: string;
  customerName: string;
  customerEmail: string;
  domain: string;
  planId: string;
  planName: string;
  planCategory: string;
  price: string;
  status: string;
  paymentRef: string | null;
  paidAt: Date | null;
  paidVia: string | null;
  whmUsername: string | null;
  whmPackage: string | null;
  provisionAttempts: number;
  provisionError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OrderRecord {
  return { ...order };
}

export const prismaOrderStore: OrderStore = {
  async findById(id) {
    const row = await db.order.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },
  async findByNumber(number) {
    const row = await db.order.findUnique({ where: { number } });
    return row ? toRecord(row) : null;
  },
  async findByLookupToken(lookupToken) {
    const row = await db.order.findUnique({ where: { lookupToken } });
    return row ? toRecord(row) : null;
  },
  async findPendingDuplicate(email, domain, planId) {
    const row = await db.order.findFirst({
      where: {
        customerEmail: email,
        domain,
        planId,
        status: "pending_payment",
      },
      orderBy: { createdAt: "desc" },
    });
    return row ? toRecord(row) : null;
  },
  async create(data) {
    return toRecord(await db.order.create({ data }));
  },
  async claimPaid(id, paymentRef, paidVia) {
    const updated = await db.order.updateMany({
      where: { id, status: "pending_payment" },
      data: { status: "paid", paymentRef, paidVia, paidAt: new Date() },
    });
    if (updated.count === 0) return null;
    const row = await db.order.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },
  async claimProvisioning(id) {
    const updated = await db.order.updateMany({
      where: { id, status: "paid" },
      data: { status: "provisioning", provisionAttempts: { increment: 1 } },
    });
    if (updated.count === 0) return null;
    const row = await db.order.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },
  async markActive(id, whmUsername) {
    return toRecord(
      await db.order.update({
        where: { id },
        data: { status: "active", whmUsername },
      }),
    );
  },
  async markFailed(id, error) {
    return toRecord(
      await db.order.update({
        where: { id },
        data: { status: "provision_failed", provisionError: error },
      }),
    );
  },
  async resetToPaid(id) {
    const updated = await db.order.updateMany({
      where: { id, status: "provision_failed" },
      data: { status: "paid", provisionError: null },
    });
    if (updated.count === 0) return null;
    const row = await db.order.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },
  async createHostingAccount(data) {
    await db.hostingAccount.upsert({
      where: { orderId: data.orderId },
      create: { ...data, status: "active" },
      update: {
        whmUsername: data.whmUsername,
        domain: data.domain,
        package: data.package,
        encryptedPassword: data.encryptedPassword,
        status: "active",
      },
    });
  },
  async usernameTaken(username, exceptOrderId) {
    const [order, account] = await Promise.all([
      db.order.findFirst({
        where: {
          whmUsername: username,
          ...(exceptOrderId ? { id: { not: exceptOrderId } } : {}),
        },
        select: { id: true },
      }),
      db.hostingAccount.findFirst({
        where: { whmUsername: username },
        select: { id: true, orderId: true },
      }),
    ]);
    if (order) return true;
    if (account && account.orderId !== exceptOrderId) return true;
    return false;
  },
};

/** Llamadas WHM necesarias para aprovisionar. La implementación real usa
 *  manageWhm (con sus comprobaciones de estado real y auditoría). */
export interface WhmProvisioner {
  createAccount(input: {
    username: string;
    domain: string;
    password: string;
    plan: string;
  }): Promise<void>;
  /** Cuenta existente en WHM (o null). Se usa para adoptar reintentos. */
  findAccount(username: string): Promise<{ domain: string } | null>;
}

async function loadWhmConfig() {
  const stored = await db.integrationConfig.findUnique({
    where: { id: "whm" },
  });
  if (!stored) throw new WhmError("pending");
  return {
    endpoint: stored.endpoint,
    credentials: decryptWhm(stored.encryptedCredentials),
  };
}

export const realWhmProvisioner: WhmProvisioner = {
  async createAccount(input) {
    await manageWhm({
      action: "createacct",
      username: input.username,
      domain: input.domain,
      password: input.password,
      plan: input.plan,
      confirmation: input.username,
      notificationsAcknowledged: true,
    });
  },
  async findAccount(username) {
    const { endpoint, credentials } = await loadWhmConfig();
    const accounts = await readWhm(endpoint, credentials, "listaccts");
    const row = accounts.rows.find((r) => r.user === username);
    return row ? { domain: row.domain ?? "" } : null;
  },
};

export interface ProvisionDeps {
  store: OrderStore;
  whm: WhmProvisioner;
}

export function defaultDeps(): ProvisionDeps {
  return { store: prismaOrderStore, whm: realWhmProvisioner };
}

// ---------------------------------------------------------------------------
// Derivación de usuario y contraseña (puras, testeables)
// ---------------------------------------------------------------------------

/** Base del usuario cPanel desde el dominio. Reglas de WHM (accountName):
 *  minúsculas, [a-z][a-z0-9_]{0,15}, sin empezar por "test". */
export function deriveWhmUsernameBase(domain: string): string {
  const sld = domain
    .toLowerCase()
    .split(".")[0]
    .replace(/[^a-z0-9_]/g, "");
  let base = sld.replace(/^[^a-z]+/, "");
  if (!base) base = "hosting";
  if (base.startsWith("test")) base = `h${base}`;
  return base.slice(0, 16);
}

function usernameWithSuffix(
  base: string,
  orderId: string,
  n: number,
): string {
  const suffix = createHmac("sha256", orderId)
    .update(`username:${n}`)
    .digest("hex")
    .slice(0, 2);
  return `${base.slice(0, 13)}_${suffix}`;
}

function provisioningKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(raw))
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY debe ser una cadena hexadecimal de 64 caracteres.",
    );
  return Buffer.from(raw, "hex");
}

const PASSWORD_LOWER = "abcdefghijklmnopqrstuvwxyz";
const PASSWORD_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PASSWORD_DIGITS = "0123456789";
const PASSWORD_SYMBOLS = "!@#$%^&*+-_=";

function passwordFromBytes(bytes: Buffer): string {
  const classes = [
    PASSWORD_LOWER,
    PASSWORD_UPPER,
    PASSWORD_DIGITS,
    PASSWORD_SYMBOLS,
  ];
  const chars: string[] = [];
  for (let i = 0; i < 20; i++) {
    const alphabet = classes[i % 4];
    chars.push(alphabet[bytes[i] % alphabet.length]);
  }
  // Mezcla determinista (Fisher-Yates con los bytes restantes).
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[20 + (i % 12)] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Contraseña de hosting determinista por pedido+usuario: un reintento tras
 *  un fallo "incierto" regenera la MISMA contraseña, así que adoptar la
 *  cuenta ya creada en WHM es seguro. 20 caracteres, las 4 clases, nunca
 *  contiene el nombre de usuario. Nunca se registra en logs. */
export function deriveHostingPassword(
  orderId: string,
  username: string,
  key?: Buffer,
): string {
  const secret = key ?? provisioningKey();
  for (let counter = 0; counter < 10; counter++) {
    const hmac = createHmac("sha256", secret)
      .update(`hosting-password:${orderId}:${username}:${counter}`)
      .digest();
    const password = passwordFromBytes(hmac);
    if (!password.toLowerCase().includes(username.toLowerCase()))
      return password;
  }
  throw new Error("No se pudo generar la contraseña de hosting.");
}

const PROVISIONING_AAD = "caluservers:provisioning:v1";

export function encryptProvisioningSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", provisioningKey(), iv);
  cipher.setAAD(Buffer.from(PROVISIONING_AAD));
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function decryptProvisioningSecret(value: string): string {
  const [version, iv, tag, body, ...rest] = value.split(":");
  if (
    version !== "v1" ||
    rest.length ||
    !/^[a-f0-9]{24}$/.test(iv) ||
    !/^[a-f0-9]{32}$/.test(tag) ||
    !/^(?:[a-f0-9]{2})+$/.test(body)
  )
    throw new Error("No se pudo descifrar la contraseña guardada.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    provisioningKey(),
    Buffer.from(iv, "hex"),
  );
  decipher.setAAD(Buffer.from(PROVISIONING_AAD));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/** Número de pedido único: CS- + 8 hex. La unicidad la garantiza la BD. */
export function generateOrderNumber(): string {
  return `CS-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Plan -> paquete WHM. Por defecto el nombre del plan; el admin puede
 *  sobreescribirlo por plan en el ajuste `whm_package_map` (JSON
 *  {planId: packageName} en SiteSetting). */
export function resolveWhmPackage(
  planId: string,
  planName: string,
  mapping?: Record<string, string> | null,
): string {
  const override = mapping?.[planId];
  return override && override.trim() ? override.trim() : planName;
}

/** URL de cPanel derivada del endpoint WHM (mismo host, puerto 2083). */
export function cpanelUrlFromWhmEndpoint(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return null;
    url.port = "2083";
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Webhook de pago (firma HMAC, agnóstico al proveedor)
// ---------------------------------------------------------------------------

/** Firma esperada: header `x-caluservers-signature: sha256=<hex hmac del
 *  cuerpo crudo con PAYMENT_WEBHOOK_SECRET>`. Sin secreto configurado el
 *  webhook está desactivado (siempre falso). */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret = process.env.PAYMENT_WEBHOOK_SECRET || "",
): boolean {
  if (!secret || !signature) return false;
  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export type ProvisionResult = {
  ok: boolean;
  order: OrderRecord;
  /** true si otro proceso ya estaba aprovisionando / ya estaba activo. */
  alreadyInFlight?: boolean;
  error?: string;
};

async function allocateUsername(
  order: OrderRecord,
  deps: ProvisionDeps,
  saltOffset = 0,
): Promise<string> {
  const base = deriveWhmUsernameBase(order.domain);
  for (let i = 0; i < 6; i++) {
    const n = i + saltOffset;
    const candidate =
      n === 0 ? base : usernameWithSuffix(base, order.id, n);
    if (await deps.store.usernameTaken(candidate, order.id)) continue;
    const existing = await deps.whm.findAccount(candidate).catch(() => null);
    if (existing) {
      // Cuenta nuestra de un intento anterior incierto: se readopta.
      if (existing.domain.toLowerCase() === order.domain.toLowerCase())
        return candidate;
      continue; // De otro cliente: probar con sufijo.
    }
    return candidate;
  }
  throw new Error(
    "No se pudo asignar un nombre de usuario WHM disponible.",
  );
}

/** Crea un pedido en pending_payment. Un doble envío del mismo cliente,
 *  dominio y plan devuelve el pedido pendiente existente (sin duplicar). */
export async function createOrderRecord(
  input: NewOrderData,
  deps: ProvisionDeps = defaultDeps(),
): Promise<OrderRecord> {
  const duplicate = await deps.store.findPendingDuplicate(
    input.customerEmail,
    input.domain,
    input.planId,
  );
  if (duplicate) return duplicate;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await deps.store.create({
        ...input,
        number: generateOrderNumber(),
      });
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (code === "P2002" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("No se pudo crear el pedido.");
}

/** Confirma el pago y aprovisiona. Idempotente: confirmar dos veces no
 *  vuelve a aprovisionar (la reclamación atómica solo la gana una vez). */
export async function confirmPayment(
  orderId: string,
  opts: { paymentRef?: string | null; paidVia: string },
  deps: ProvisionDeps = defaultDeps(),
): Promise<{
  order: OrderRecord;
  alreadyConfirmed: boolean;
  provisioned: boolean;
  provisionError?: string;
}> {
  const claimed = await deps.store.claimPaid(
    orderId,
    opts.paymentRef ?? null,
    opts.paidVia,
  );
  if (!claimed) {
    const current = await deps.store.findById(orderId);
    if (!current) throw new Error("Pedido no encontrado.");
    return {
      order: current,
      alreadyConfirmed: true,
      provisioned: current.status === "active",
    };
  }
  const result = await provisionOrder(claimed.id, deps);
  return {
    order: result.order,
    alreadyConfirmed: false,
    provisioned: result.ok,
    provisionError: result.error,
  };
}

/** Aprovisiona un pedido pagado: crea la cuenta cPanel en WHM y la vincula.
 *  Solo un llamador gana la reclamación; los demás reciben el estado actual. */
export async function provisionOrder(
  orderId: string,
  deps: ProvisionDeps = defaultDeps(),
): Promise<ProvisionResult> {
  const claimed = await deps.store.claimProvisioning(orderId);
  if (!claimed) {
    const current = await deps.store.findById(orderId);
    if (!current) throw new Error("Pedido no encontrado.");
    return {
      ok: current.status === "active",
      order: current,
      alreadyInFlight: true,
    };
  }
  const order = claimed;
  const pkg = order.whmPackage ?? order.planName;
  let username: string | null = null;
  let password: string | null = null;
  let created = false;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    username = await allocateUsername(order, deps, attempt * 10);
    password = deriveHostingPassword(order.id, username);
    try {
      await deps.whm.createAccount({
        username,
        domain: order.domain,
        password,
        plan: pkg,
      });
      created = true;
    } catch (error) {
      if (error instanceof WhmError && error.code === "conflict") {
        const existing = await deps.whm
          .findAccount(username)
          .catch(() => null);
        if (
          existing &&
          existing.domain.toLowerCase() === order.domain.toLowerCase()
        ) {
          created = true; // Adoptar: la cuenta ya es nuestra.
          break;
        }
        continue; // Otro cliente tiene ese usuario: reintentar con otro.
      }
      const safe = safeWhmError(error);
      const failed = await deps.store.markFailed(order.id, safe.message);
      return { ok: false, order: failed, error: safe.message };
    }
  }
  if (!created || !username || !password) {
    const failed = await deps.store.markFailed(
      order.id,
      "No se pudo crear la cuenta en WHM. Revisa los datos antes de reintentar.",
    );
    return {
      ok: false,
      order: failed,
      error: "No se pudo crear la cuenta en WHM.",
    };
  }
  await deps.store.createHostingAccount({
    orderId: order.id,
    whmUsername: username,
    domain: order.domain,
    package: pkg,
    encryptedPassword: encryptProvisioningSecret(password),
  });
  const active = await deps.store.markActive(order.id, username);
  return { ok: true, order: active };
}

/** Reintenta el aprovisionamiento de un pedido fallido. Solo desde
 *  provision_failed; si ya está activo no hace nada. */
export async function retryProvisioning(
  orderId: string,
  deps: ProvisionDeps = defaultDeps(),
): Promise<ProvisionResult> {
  const reset = await deps.store.resetToPaid(orderId);
  if (!reset) {
    const current = await deps.store.findById(orderId);
    if (!current) throw new Error("Pedido no encontrado.");
    if (current.status === "active")
      return { ok: true, order: current, alreadyInFlight: true };
    throw new Error(
      "Solo se puede reintentar un pedido con aprovisionamiento fallido.",
    );
  }
  return provisionOrder(reset.id, deps);
}
