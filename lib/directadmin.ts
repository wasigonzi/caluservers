import "server-only";
import { getPluginConfig, getPluginSecrets, isPluginEnabled } from "./plugins";
import { OutboundError, requestText } from "./outbound";
import type { ControlPanel } from "./plugin-types";

/**
 * Adaptador DirectAdmin (API legacy CMD_API_*) — Fase 4, frente B.
 *
 * Documentación oficial verificada (ver docs/PANELES.md):
 * - Base https://<host>:2222, Basic auth (RFC 7617). Se recomienda una
 *   clave de acceso (login key) dedicada en vez de la contraseña del
 *   admin. La API nueva (/api/...) solo tiene lecturas de usuarios
 *   (GET /api/users/list, GET /api/users/{username}/config): crear,
 *   suspender y borrar usuarios solo existen en la API legacy.
 * - Crear usuario: POST /CMD_API_ACCOUNT_USER?json=yes
 *   {action:create, add:Submit, username (4-8, alfanumérico), email,
 *   passwd, passwd2, domain, package, ip (libre o compartida),
 *   notify:yes|no}. Éxito: error=0.
 * - Borrar: POST /CMD_API_SELECT_USERS
 *   {confirmed:Confirm, delete:yes, select0}.
 * - Suspender/reactivar (CONMUTA el estado): POST /CMD_API_SELECT_USERS
 *   {location:CMD_SELECT_USERS, suspend:"Suspend/Unsuspend", select0}.
 *   Por eso suspender y reactivar leen antes el estado con
 *   CMD_API_SHOW_USER_CONFIG y no llaman si ya está en ese estado.
 * - Listar: GET /CMD_API_SHOW_ALL_USERS?json=yes (admin, todos los
 *   usuarios) y GET /CMD_API_SHOW_USER_CONFIG?user=X&json=yes
 *   (domain, suspended yes/no, account ON/OFF, package, ip, creator).
 * - Paquetes: GET /CMD_API_PACKAGES_USER?json=yes (lista) y
 *   ?package=nombre (uno). Reseller: CMD_API_PACKAGES_RESELLER.
 * - Modificar: POST /CMD_API_MODIFY_USER action=customize (reescribe
 *   TODOS los límites; sin campo `package` documentado).
 *
 * Reglas:
 * - Doble cerrojo: sin DIRECTADMIN_ENABLED=true en el entorno, sin el
 *   plugin activo o sin credenciales guardadas, todo lanza
 *   `unconfigured` (el llamador responde 503): nunca se simula un alta
 *   ni un listado.
 * - La IP del servidor para las altas sale de la configuración del
 *   plugin (`ipAddress`): DirectAdmin exige una IP libre o compartida
 *   al crear el usuario. Sin ella, createAccount falla con un error
 *   claro antes de llamar.
 * - changePackage NO está soportado: la documentación oficial solo
 *   documenta action=customize, que reescribe todos los límites y
 *   apaga las opciones que no se envían (ver docs/PANELES.md). El
 *   cambio de paquete se hace en el panel de DirectAdmin.
 * - Las respuestas legacy son url-encoded (`error=0&text=...`) o JSON
 *   con `?json=yes`: se aceptan ambas. Los errores nunca filtran el
 *   cuerpo crudo: solo se devuelve un mensaje genérico en español.
 * - El certificado TLS del panel debe ser válido: no se aceptan
 *   certificados autofirmados.
 * - No se llama a ningún servidor DirectAdmin en pruebas: el transporte
 *   es inyectable (ver `__setDirectAdminFetch`).
 */

export const DIRECTADMIN_DEFAULT_PORT = 2222;

const MESSAGES = {
  unconfigured:
    "DirectAdmin no está configurado. Activa el plugin, pon DIRECTADMIN_ENABLED=true y guarda la URL y las credenciales.",
  invalid: "Los datos para DirectAdmin no son válidos.",
  "not-supported":
    "Esa operación no la ofrece la API de DirectAdmin de forma segura. Se gestiona en el panel de DirectAdmin.",
  upstream: "DirectAdmin no completó la operación. No se hizo ningún cambio.",
} as const;

export type DirectAdminErrorCode = keyof typeof MESSAGES;

const HTTP_STATUS: Record<DirectAdminErrorCode, number> = {
  unconfigured: 503,
  invalid: 400,
  "not-supported": 501,
  upstream: 502,
};

export class DirectAdminError extends Error {
  readonly httpStatus: number;
  constructor(
    readonly code: DirectAdminErrorCode,
    message?: string,
  ) {
    super(message ?? MESSAGES[code]);
    this.name = "DirectAdminError";
    this.httpStatus = HTTP_STATUS[code];
  }
}

export type DirectAdminTransport = (options: {
  url: string;
  method: "GET" | "POST";
  allowHosts: readonly string[];
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
  accept?: string;
  timeoutMs?: number;
  bodyLimit?: number;
}) => Promise<{ status: number; text: string; headers?: Record<string, string> }>;

/** Transporte real por defecto; las pruebas lo sustituyen (sin red real). */
let transport: DirectAdminTransport = (options) => requestText(options);

/** Solo para pruebas: sustituye el transporte HTTP por un doble falso. */
export function __setDirectAdminFetch(fn: DirectAdminTransport): void {
  transport = fn;
}

/** Solo para pruebas: restaura el transporte real. */
export function __resetDirectAdminFetch(): void {
  transport = (options) => requestText(options);
}

/* ------------------------------ parseo legacy ------------------------------ */

type DaParsed = Record<string, string> | string[] | null;

/**
 * Una respuesta legacy: JSON (con `?json=yes`) o url-encoded
 * (`error=0&text=...`, `list[]=a&list[]=b`). Devuelve el objeto, la
 * lista o null si no se reconoce nada. Nunca lanza por el contenido.
 */
export function parseDaResponse(text: string): DaParsed {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
      if (parsed && typeof parsed === "object") {
        const out: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === "string") out[key] = value;
          else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
        }
        return out;
      }
      return null;
    } catch {
      return null;
    }
  }
  try {
    const params = new URLSearchParams(trimmed);
    const list = params.getAll("list[]");
    if (list.length > 0) return list;
    const out: Record<string, string> = {};
    let any = false;
    for (const [key, value] of params.entries()) {
      out[key] = value;
      any = true;
    }
    return any ? out : null;
  } catch {
    return null;
  }
}

/** `error` de una respuesta legacy: "0" es éxito, "1" es fallo. */
function isDaError(parsed: DaParsed): boolean {
  return (
    parsed !== null &&
    !Array.isArray(parsed) &&
    (parsed.error === "1" || parsed.error === "true")
  );
}

function isDaOk(parsed: DaParsed): boolean {
  return (
    parsed !== null &&
    !Array.isArray(parsed) &&
    (parsed.error === "0" || parsed.error === "false")
  );
}

/** true si el campo `suspended` de SHOW_USER_CONFIG dice que sí. */
export function parseDaSuspended(parsed: DaParsed): boolean | null {
  if (!parsed || Array.isArray(parsed)) return null;
  const value = parsed.suspended;
  if (value === undefined) return null;
  if (value === "yes" || value === "true") return true;
  if (value === "no" || value === "false") return false;
  return null;
}

/* ------------------------------ credenciales ------------------------------ */

type DirectAdminCredentials = {
  base: string;
  host: string;
  login: string;
  password: string;
  ipAddress: string;
};

async function directAdminCredentials(): Promise<DirectAdminCredentials> {
  if (process.env.DIRECTADMIN_ENABLED !== "true") {
    throw new DirectAdminError("unconfigured");
  }
  if (!(await isPluginEnabled("directadmin").catch(() => false))) {
    throw new DirectAdminError("unconfigured");
  }
  const config = await getPluginConfig("directadmin").catch(
    (): Record<string, unknown> => ({}),
  );
  const rawUrl = typeof config.url === "string" ? config.url.trim() : "";
  if (!rawUrl) throw new DirectAdminError("unconfigured");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new DirectAdminError(
      "invalid",
      "La URL del servidor DirectAdmin no es válida: usa solo el origen https, por ejemplo https://servidor:2222.",
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new DirectAdminError(
      "invalid",
      "La URL del servidor DirectAdmin no es válida: usa solo el origen https, por ejemplo https://servidor:2222.",
    );
  }
  const port = parsed.port ? Number(parsed.port) : DIRECTADMIN_DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new DirectAdminError("invalid", "El puerto del servidor DirectAdmin no es válido.");
  }
  const secrets = await getPluginSecrets("directadmin").catch(() => null);
  const login = secrets?.login?.trim() ?? "";
  const password = secrets?.password?.trim() ?? "";
  if (!login || !password) throw new DirectAdminError("unconfigured");
  const ipAddress = typeof config.ipAddress === "string" ? config.ipAddress.trim() : "";
  return {
    base: `https://${parsed.hostname}:${port}`,
    host: parsed.hostname.toLowerCase(),
    login,
    password,
    ipAddress,
  };
}

/* ------------------------------ llamadas ------------------------------ */

type DaCallResult = {
  status: number;
  text: string;
  headers: Record<string, string>;
  parsed: DaParsed;
};

/**
 * Una llamada legacy. El éxito se decide así, en este orden:
 * 1. Redirección 3xx a la `location` pedida (el éxito documentado de
 *    CMD_API_SELECT_USERS es una Location, no un cuerpo).
 * 2. Cuerpo con error=0 (url-encoded o JSON con `?json=yes`).
 * Cualquier otra cosa es `upstream`. El texto del servidor nunca sale
 * en el mensaje de error.
 */
async function callDirectAdmin(
  path: string,
  options: { method: "GET" | "POST"; body?: Record<string, string>; expectLocation?: string },
  credentials?: DirectAdminCredentials,
  bodyLimit?: number,
): Promise<DaCallResult> {
  const creds = credentials ?? (await directAdminCredentials());
  const form = options.body
    ? new URLSearchParams(options.body).toString()
    : undefined;
  let result: { status: number; text: string; headers?: Record<string, string> };
  try {
    result = await transport({
      url: `${creds.base}${path}`,
      method: options.method,
      allowHosts: [creds.host],
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.login}:${creds.password}`, "utf8").toString("base64")}`,
      },
      ...(form !== undefined
        ? { body: form, contentType: "application/x-www-form-urlencoded" }
        : {}),
      accept: "application/json",
      timeoutMs: 10_000,
      ...(bodyLimit !== undefined ? { bodyLimit } : {}),
    });
  } catch (error) {
    if (error instanceof OutboundError) {
      if (error.code === "timeout") {
        throw new DirectAdminError(
          "upstream",
          "DirectAdmin no respondió a tiempo. No se hizo ningún cambio.",
        );
      }
      if (error.code === "blocked") {
        throw new DirectAdminError(
          "invalid",
          "El servidor DirectAdmin debe resolver a una IP pública y tener un certificado TLS válido.",
        );
      }
      throw new DirectAdminError("upstream");
    }
    throw error;
  }
  const headers = result.headers ?? {};
  const parsed = parseDaResponse(result.text);
  if (result.status === 401 || result.status === 403) {
    throw new DirectAdminError(
      "upstream",
      "DirectAdmin rechazó las credenciales. Revisa el usuario y la contraseña o la clave de acceso en el panel de plugins.",
    );
  }
  if (result.status >= 300 && result.status < 400) {
    const location = headers.location ?? "";
    if (
      options.expectLocation &&
      (location.includes(options.expectLocation) || location.includes("CMD_SELECT_USERS"))
    ) {
      return { status: result.status, text: result.text, headers, parsed };
    }
    throw new DirectAdminError("upstream");
  }
  if (result.status !== 200) {
    throw new DirectAdminError("upstream");
  }
  if (isDaError(parsed)) {
    throw new DirectAdminError("upstream");
  }
  return { status: result.status, text: result.text, headers, parsed };
}

/** Éxito de escritura: error=0 o redirección aceptada por callDirectAdmin. */
function assertDaWriteOk(result: DaCallResult): void {
  if (result.parsed !== null && !isDaOk(result.parsed)) {
    throw new DirectAdminError("upstream");
  }
}

/** Config del usuario (SHOW_USER_CONFIG) o null si no se pudo leer. */
async function getUserConfig(
  username: string,
  creds: DirectAdminCredentials,
): Promise<Record<string, string> | null> {
  let result: DaCallResult;
  try {
    result = await callDirectAdmin(
      `/CMD_API_SHOW_USER_CONFIG?user=${encodeURIComponent(username)}&json=yes`,
      { method: "GET" },
      creds,
    );
  } catch {
    return null;
  }
  const parsed = result.parsed;
  if (!parsed || Array.isArray(parsed)) return null;
  return parsed;
}

/* ------------------------------ adaptador ------------------------------ */

export class DirectAdminPanel implements ControlPanel {
  readonly key = "directadmin";

  /**
   * Crea el usuario con el paquete indicado y la IP configurada.
   * DirectAdmin exige un nombre de usuario de 4 a 8 caracteres
   * alfanuméricos en minúsculas. No se envía el correo de bienvenida de
   * DirectAdmin (notify=no): los avisos los manda CaluServers.
   */
  async createAccount(input: {
    domain: string;
    username: string;
    password: string;
    plan: string;
    email: string;
  }): Promise<{ username: string; domain: string }> {
    const creds = await directAdminCredentials();
    if (!creds.ipAddress) {
      throw new DirectAdminError(
        "invalid",
        "Falta la dirección IP del servidor: configúrala en el plugin DirectAdmin (campo IP del servidor). DirectAdmin la exige al crear el usuario.",
      );
    }
    const username = input.username.trim().toLowerCase();
    const domain = input.domain.trim().toLowerCase();
    const email = input.email.trim();
    const plan = input.plan.trim();
    if (!/^[a-z0-9]{4,8}$/.test(username)) {
      throw new DirectAdminError(
        "invalid",
        "El nombre de usuario para DirectAdmin debe tener de 4 a 8 caracteres alfanuméricos en minúsculas.",
      );
    }
    if (!domain || !email || !plan || !input.password) {
      throw new DirectAdminError(
        "invalid",
        "Faltan el dominio, el correo, el paquete o la contraseña.",
      );
    }
    const result = await callDirectAdmin(
      "/CMD_API_ACCOUNT_USER?json=yes",
      {
        method: "POST",
        body: {
          action: "create",
          add: "Submit",
          username,
          email,
          passwd: input.password,
          passwd2: input.password,
          domain,
          package: plan,
          ip: creds.ipAddress,
          notify: "no",
        },
      },
      creds,
    );
    assertDaWriteOk(result);
    return { username, domain };
  }

  /**
   * Suspende al usuario. CMD_API_SELECT_USERS CONMUTA el estado, así que
   * primero se lee si ya está suspendido: si lo está, no se llama.
   */
  async suspendAccount(input: { username: string; reason?: string }): Promise<void> {
    await this.toggleSuspend(input.username.trim().toLowerCase(), true);
  }

  /** Reactiva al usuario (misma conmutación, con lectura previa). */
  async unsuspendAccount(input: { username: string }): Promise<void> {
    await this.toggleSuspend(input.username.trim().toLowerCase(), false);
  }

  private async toggleSuspend(username: string, suspend: boolean): Promise<void> {
    const creds = await directAdminCredentials();
    const config = await getUserConfig(username, creds);
    if (config === null) {
      throw new DirectAdminError(
        "upstream",
        "DirectAdmin no devolvió la configuración del usuario. No se hizo ningún cambio.",
      );
    }
    const suspended = parseDaSuspended(config);
    if (suspended === null) {
      throw new DirectAdminError(
        "upstream",
        "DirectAdmin no devolvió si el usuario está suspendido. No se hizo ningún cambio.",
      );
    }
    if (suspended === suspend) return;
    const result = await callDirectAdmin(
      "/CMD_API_SELECT_USERS?json=yes",
      {
        method: "POST",
        body: {
          location: "CMD_SELECT_USERS",
          suspend: "Suspend/Unsuspend",
          select0: username,
        },
        expectLocation: "CMD_SELECT_USERS",
      },
      creds,
    );
    assertDaWriteOk(result);
  }

  /**
   * Borra al usuario y todos sus dominios y datos
   * (CMD_API_SELECT_USERS con confirmed=Confirm y delete=yes).
   */
  async terminateAccount(input: { username: string }): Promise<void> {
    const creds = await directAdminCredentials();
    const result = await callDirectAdmin(
      "/CMD_API_SELECT_USERS?json=yes",
      {
        method: "POST",
        body: {
          confirmed: "Confirm",
          delete: "yes",
          select0: input.username.trim().toLowerCase(),
        },
        expectLocation: "CMD_SELECT_USERS",
      },
      creds,
    );
    assertDaWriteOk(result);
  }

  /**
   * NO SOPORTADO (501 honesto): la documentación oficial solo documenta
   * CMD_API_MODIFY_USER con action=customize, que reescribe TODOS los
   * límites del usuario y apaga las opciones que no se envían; no hay
   * campo `package` documentado. El cambio de paquete se hace en el
   * panel de DirectAdmin.
   */
  async changePackage(_input: { username: string; plan: string }): Promise<void> {
    throw new DirectAdminError(
      "not-supported",
      "DirectAdmin no ofrece el cambio de paquete por API en la documentación oficial: el único cambio documentado reescribe todos los límites y puede desactivar opciones. Cambia el paquete en el panel de DirectAdmin.",
    );
  }

  /**
   * Todos los usuarios del servidor con su dominio principal y si están
   * suspendidos. Los usuarios cuya configuración no se puede leer se
   * omiten de la lista (no tumban el listado entero).
   */
  async listAccounts(): Promise<{ username: string; domain: string; suspended: boolean }[]> {
    const creds = await directAdminCredentials();
    const result = await callDirectAdmin(
      "/CMD_API_SHOW_ALL_USERS?json=yes",
      { method: "GET" },
      creds,
      2 * 1024 * 1024,
    );
    const parsed = result.parsed;
    const usernames = Array.isArray(parsed) ? parsed : [];
    const out: { username: string; domain: string; suspended: boolean }[] = [];
    for (const username of usernames) {
      const config = await getUserConfig(username, creds);
      if (config === null) continue;
      const domain = config.domain ?? "";
      const suspended = parseDaSuspended(config);
      if (!domain || suspended === null) continue;
      out.push({ username, domain, suspended });
    }
    return out;
  }

  /**
   * Todos los paquetes de usuario (CMD_API_PACKAGES_USER). Es la
   * operación de solo lectura que usa la prueba de conexión del panel
   * de plugins.
   */
  async listPackages(): Promise<{ name: string }[]> {
    const creds = await directAdminCredentials();
    const result = await callDirectAdmin(
      "/CMD_API_PACKAGES_USER?json=yes",
      { method: "GET" },
      creds,
      2 * 1024 * 1024,
    );
    const parsed = result.parsed;
    const names = Array.isArray(parsed) ? parsed : [];
    return names.map((name) => ({ name }));
  }
}

export const directAdminPanel = new DirectAdminPanel();

/** Adaptador por clave. Hoy solo existe DirectAdmin en este módulo. */
export function getPanel(key = "directadmin"): DirectAdminPanel {
  if (key !== "directadmin") {
    throw new DirectAdminError(
      "not-supported",
      `El panel "${key}" no tiene adaptador en este módulo.`,
    );
  }
  return directAdminPanel;
}
