import "server-only";
import { getPluginConfig, getPluginSecrets, isPluginEnabled } from "./plugins";
import { OutboundError, requestText } from "./outbound";
import type { ControlPanel } from "./plugin-types";

/**
 * Adaptador Plesk (API-RPC / XML API) — Fase 4, frente B.
 *
 * Documentación oficial verificada (ver docs/PANELES.md):
 * - Transporte: POST https://<host>:8443/enterprise/control/agent.php,
 *   Content-Type: text/xml. Auth por cabeceras HTTP_AUTH_LOGIN /
 *   HTTP_AUTH_PASSWD, o cabecera KEY con una clave secreta.
 * - Operador <customer>: ADD (gen_info: cname, pname, login, passwd,
 *   status 0, email; login duplicado = errcode 1007), GET (filtro por id
 *   o login, dataset gen_info), DEL (filtro por id o login; borra el
 *   cliente y TODAS sus suscripciones y dominios).
 * - Operador <webspace>: ADD (gen_setup: name, owner-id, htype vrt_hst,
 *   ip_address OBLIGATORIA, status 0; hosting vrt_hst con ftp_login /
 *   ftp_password; plan-name opcional), GET (filtro vacío = todas,
 *   owner-login o name; dataset gen_info: name, status, owner-id,
 *   owner-login), SET (values gen_setup status: 0 activo, 16 desactivado
 *   por el administrador, 32 por el reseller, 64 por el cliente),
 *   SWITCH-SUBSCRIPTION (filtro por id + plan-guid; NO acepta plan-name).
 * - Operador <service-plan>: GET (filtro vacío, por name, id o guid;
 *   owner-all para todos los propietarios; respuesta: id, name, guid).
 *
 * Reglas:
 * - Doble cerrojo: sin PLESK_ENABLED=true en el entorno, sin el plugin
 *   activo o sin credenciales guardadas, todo lanza `unconfigured`
 *   (el llamador responde 503): nunca se simula un alta ni un listado.
 * - La IP del servidor para las altas sale de la configuración del
 *   plugin (`ipAddress`): Plesk la exige al crear la suscripción. Sin
 *   ella, createAccount falla con un error claro antes de llamar.
 * - La suspensión es a nivel de suscripción (webspace SET status 16
 *   sobre todas las suscripciones del cliente): el login del cliente en
 *   Plesk sigue activo, pero sus sitios quedan desactivados. No se usa
 *   customer SET: sus valores de status no se verificaron.
 * - changePackage resuelve el nombre del plan a su GUID con
 *   service-plan GET y cambia TODAS las suscripciones del cliente con
 *   SWITCH-SUBSCRIPTION.
 * - Los errores nunca filtran el cuerpo crudo: solo el errcode numérico
 *   de Plesk llega al mensaje genérico. El certificado TLS del panel
 *   debe ser válido: no se aceptan certificados autofirmados.
 * - No se llama a ningún servidor Plesk en pruebas: el transporte es
 *   inyectable (ver `__setPleskFetch`).
 */

export const PLESK_PACKET_VERSION = "1.6.7.0";
export const PLESK_AGENT_PATH = "/enterprise/control/agent.php";
export const PLESK_DEFAULT_PORT = 8443;

const MESSAGES = {
  unconfigured:
    "Plesk no está configurado. Activa el plugin, pon PLESK_ENABLED=true y guarda la URL y las credenciales.",
  invalid: "Los datos para Plesk no son válidos.",
  "not-supported":
    "Esa operación no la ofrece la API-RPC de Plesk de la forma pedida. Se gestiona en el panel de Plesk.",
  upstream: "Plesk no completó la operación. No se hizo ningún cambio.",
} as const;

export type PleskErrorCode = keyof typeof MESSAGES;

const HTTP_STATUS: Record<PleskErrorCode, number> = {
  unconfigured: 503,
  invalid: 400,
  "not-supported": 501,
  upstream: 502,
};

export class PleskError extends Error {
  readonly httpStatus: number;
  constructor(
    readonly code: PleskErrorCode,
    message?: string,
  ) {
    super(message ?? MESSAGES[code]);
    this.name = "PleskError";
    this.httpStatus = HTTP_STATUS[code];
  }
}

export type PleskTransport = (options: {
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
let transport: PleskTransport = (options) => requestText(options);

/** Solo para pruebas: sustituye el transporte HTTP por un doble falso. */
export function __setPleskFetch(fn: PleskTransport): void {
  transport = fn;
}

/** Solo para pruebas: restaura el transporte real. */
export function __resetPleskFetch(): void {
  transport = (options) => requestText(options);
}

/* ------------------------------ XML mínimo ------------------------------ */

/**
 * Analizador XML mínimo, solo para las respuestas de la API-RPC de Plesk:
 * elementos, texto, entidades, CDATA, comentarios y etiquetas
 * autocontenidas. Los atributos se ignoran (la API-RPC no devuelve datos
 * en atributos salvo `version` del paquete). Cualquier XML mal formado
 * lanza PleskError `upstream`: nunca se devuelve medio parseado.
 */
export type XmlNode = {
  tag: string;
  /** Texto directo del nodo, con entidades decodificadas y recortado. */
  text: string;
  children: XmlNode[];
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

export function parsePleskPacket(xml: string): XmlNode {
  let pos = 0;
  const len = xml.length;

  function fail(): never {
    throw new PleskError(
      "upstream",
      "Plesk devolvió una respuesta que no se pudo leer.",
    );
  }

  function skipMisc(): void {
    for (;;) {
      if (xml.startsWith("<?", pos)) {
        const end = xml.indexOf("?>", pos + 2);
        if (end === -1) fail();
        pos = end + 2;
      } else if (xml.startsWith("<!--", pos)) {
        const end = xml.indexOf("-->", pos + 4);
        if (end === -1) fail();
        pos = end + 3;
      } else if (xml[pos] === " " || xml[pos] === "\n" || xml[pos] === "\r" || xml[pos] === "\t") {
        pos += 1;
      } else {
        return;
      }
    }
  }

  function parseElement(): XmlNode {
    if (xml[pos] !== "<") fail();
    if (xml.startsWith("</", pos) || xml.startsWith("<?", pos) || xml.startsWith("<!", pos)) {
      fail();
    }
    const tagEnd = xml.indexOf(">", pos + 1);
    if (tagEnd === -1) fail();
    const inside = xml.slice(pos + 1, tagEnd);
    const selfClosing = inside.trimEnd().endsWith("/");
    const tag = inside
      .replace(/\/$/, "")
      .trim()
      .split(/\s+/, 1)[0];
    if (!tag || !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(tag)) fail();
    pos = tagEnd + 1;
    const node: XmlNode = { tag, text: "", children: [] };
    if (selfClosing) return node;
    for (;;) {
      if (pos >= len) fail();
      if (xml.startsWith(`</${tag}>`, pos)) {
        pos += tag.length + 3;
        node.text = decodeEntities(node.text).trim();
        return node;
      }
      if (xml.startsWith("</", pos)) fail();
      if (xml.startsWith("<!--", pos)) {
        const end = xml.indexOf("-->", pos + 4);
        if (end === -1) fail();
        pos = end + 3;
        continue;
      }
      if (xml.startsWith("<![CDATA[", pos)) {
        const end = xml.indexOf("]]>", pos + 9);
        if (end === -1) fail();
        node.text += xml.slice(pos + 9, end);
        pos = end + 3;
        continue;
      }
      if (xml[pos] === "<") {
        node.children.push(parseElement());
        continue;
      }
      const next = xml.indexOf("<", pos);
      const chunk = next === -1 ? xml.slice(pos) : xml.slice(pos, next);
      node.text += chunk;
      pos = next === -1 ? len : next;
    }
  }

  skipMisc();
  const root = parseElement();
  skipMisc();
  if (pos !== len) fail();
  return root;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function findAll(node: XmlNode, tag: string, out: XmlNode[] = []): XmlNode[] {
  for (const child of node.children) {
    if (child.tag === tag) out.push(child);
    findAll(child, tag, out);
  }
  return out;
}

function child(node: XmlNode | null, tag: string): XmlNode | null {
  if (!node) return null;
  return node.children.find((entry) => entry.tag === tag) ?? null;
}

function childText(node: XmlNode | null, tag: string): string | null {
  const found = child(node, tag);
  if (!found || found.text === "") return null;
  return found.text;
}

/** Todos los <result> de una respuesta, en orden. */
function resultsOf(root: XmlNode): XmlNode[] {
  return findAll(root, "result");
}

/**
 * Exige que todos los <result> tengan <status>ok</status>. Si alguno es
 * error, lanza `upstream` con solo el errcode numérico (nunca el errtext
 * crudo del servidor). Sin ningún <result>, lanza `invalid` con el
 * mensaje dado: la operación no encontró a quién aplicarse.
 */
function assertResultsOk(root: XmlNode, emptyMessage: string): XmlNode[] {
  const results = resultsOf(root);
  if (results.length === 0) {
    throw new PleskError("invalid", emptyMessage);
  }
  for (const result of results) {
    if (childText(result, "status") !== "ok") {
      const errcode = childText(result, "errcode");
      throw new PleskError(
        "upstream",
        errcode
          ? `Plesk no completó la operación (código ${errcode}).`
          : "Plesk no completó la operación.",
      );
    }
  }
  return results;
}

/* ------------------------------ credenciales ------------------------------ */

type PleskCredentials = {
  base: string;
  host: string;
  mode: "login" | "secret-key";
  login: string;
  password: string;
  secretKey: string;
  ipAddress: string;
};

async function pleskCredentials(): Promise<PleskCredentials> {
  if (process.env.PLESK_ENABLED !== "true") {
    throw new PleskError("unconfigured");
  }
  if (!(await isPluginEnabled("plesk").catch(() => false))) {
    throw new PleskError("unconfigured");
  }
  const config = await getPluginConfig("plesk").catch(
    (): Record<string, unknown> => ({}),
  );
  const rawUrl = typeof config.url === "string" ? config.url.trim() : "";
  if (!rawUrl) throw new PleskError("unconfigured");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new PleskError(
      "invalid",
      "La URL del servidor Plesk no es válida: usa solo el origen https, por ejemplo https://servidor:8443.",
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
    throw new PleskError(
      "invalid",
      "La URL del servidor Plesk no es válida: usa solo el origen https, por ejemplo https://servidor:8443.",
    );
  }
  const port = parsed.port ? Number(parsed.port) : PLESK_DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PleskError("invalid", "El puerto del servidor Plesk no es válido.");
  }
  const mode = config.mode === "secret-key" ? "secret-key" : "login";
  const secrets = await getPluginSecrets("plesk").catch(() => null);
  const login = secrets?.login?.trim() ?? "";
  const password = secrets?.password?.trim() ?? "";
  const secretKey = secrets?.secretKey?.trim() ?? "";
  if (mode === "secret-key") {
    if (!secretKey) throw new PleskError("unconfigured");
  } else if (!login || !password) {
    throw new PleskError("unconfigured");
  }
  const ipAddress = typeof config.ipAddress === "string" ? config.ipAddress.trim() : "";
  return {
    base: `https://${parsed.hostname}:${port}`,
    host: parsed.hostname.toLowerCase(),
    mode,
    login,
    password,
    secretKey,
    ipAddress,
  };
}

/* ------------------------------ llamadas ------------------------------ */

/** Una llamada API-RPC: paquete XML por POST al agent.php. */
async function callPlesk(
  packet: string,
  credentials?: PleskCredentials,
  bodyLimit?: number,
): Promise<XmlNode> {
  const creds = credentials ?? (await pleskCredentials());
  const headers: Record<string, string> =
    creds.mode === "secret-key"
      ? { KEY: creds.secretKey }
      : { HTTP_AUTH_LOGIN: creds.login, HTTP_AUTH_PASSWD: creds.password };
  let result: { status: number; text: string };
  try {
    result = await transport({
      url: `${creds.base}${PLESK_AGENT_PATH}`,
      method: "POST",
      allowHosts: [creds.host],
      headers,
      body: packet,
      contentType: "text/xml",
      accept: "text/xml",
      timeoutMs: 10_000,
      ...(bodyLimit !== undefined ? { bodyLimit } : {}),
    });
  } catch (error) {
    if (error instanceof OutboundError) {
      if (error.code === "timeout") {
        throw new PleskError("upstream", "Plesk no respondió a tiempo. No se hizo ningún cambio.");
      }
      if (error.code === "blocked") {
        throw new PleskError(
          "invalid",
          "El servidor Plesk debe resolver a una IP pública y tener un certificado TLS válido.",
        );
      }
      throw new PleskError("upstream");
    }
    throw error;
  }
  if (result.status === 401 || result.status === 403) {
    throw new PleskError(
      "upstream",
      "Plesk rechazó las credenciales. Revisa el usuario y la contraseña o la clave secreta en el panel de plugins.",
    );
  }
  if (result.status !== 200) {
    throw new PleskError("upstream");
  }
  return parsePleskPacket(result.text);
}

function packet(body: string): string {
  return `<packet version="${PLESK_PACKET_VERSION}">${body}</packet>`;
}

/** Id del cliente por su login, o null si no existe. */
async function findCustomerId(
  login: string,
  creds: PleskCredentials,
): Promise<number | null> {
  const root = await callPlesk(
    packet(
      `<customer><get><filter><login>${escapeXml(login)}</login></filter>` +
        `<dataset><gen_info/></dataset></get></customer>`,
    ),
    creds,
  );
  const results = resultsOf(root);
  if (results.length === 0) return null;
  const first = results[0];
  if (childText(first, "status") !== "ok") return null;
  const id = childText(first, "id");
  const parsed = id === null ? NaN : Number.parseInt(id, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

/* ------------------------------ adaptador ------------------------------ */

export class PleskPanel implements ControlPanel {
  readonly key = "plesk";

  /**
   * Crea el cliente (o reutiliza el existente si el login ya está, errcode
   * 1007) y luego su suscripción con el dominio, la IP configurada y el
   * plan indicado. El usuario de FTP de la suscripción es el mismo login
   * del cliente. Si la suscripción falla tras crear el cliente, el
   * cliente queda creado en Plesk: no se borra solo.
   */
  async createAccount(input: {
    domain: string;
    username: string;
    password: string;
    plan: string;
    email: string;
  }): Promise<{ username: string; domain: string }> {
    const creds = await pleskCredentials();
    if (!creds.ipAddress) {
      throw new PleskError(
        "invalid",
        "Falta la dirección IP del servidor: configúrala en el plugin Plesk (campo IP del servidor). Plesk la exige al crear la suscripción.",
      );
    }
    const username = input.username.trim();
    const domain = input.domain.trim().toLowerCase();
    const email = input.email.trim();
    const plan = input.plan.trim();
    if (!username || !domain || !email || !input.password) {
      throw new PleskError("invalid", "Faltan el usuario, el dominio, el correo o la contraseña.");
    }
    let customerId: number | null = null;
    const addRoot = await callPlesk(
      packet(
        `<customer><add><gen_info>` +
          `<cname>${escapeXml(username)}</cname>` +
          `<pname>${escapeXml(username)}</pname>` +
          `<login>${escapeXml(username)}</login>` +
          `<passwd>${escapeXml(input.password)}</passwd>` +
          `<status>0</status>` +
          `<email>${escapeXml(email)}</email>` +
          `</gen_info></add></customer>`,
      ),
      creds,
    );
    const addResults = resultsOf(addRoot);
    if (addResults.length === 0) {
      throw new PleskError("upstream");
    }
    const addFirst = addResults[0];
    if (childText(addFirst, "status") === "ok") {
      const id = childText(addFirst, "id");
      const parsed = id === null ? NaN : Number.parseInt(id, 10);
      if (!Number.isInteger(parsed)) throw new PleskError("upstream");
      customerId = parsed;
    } else if (childText(addFirst, "errcode") === "1007") {
      // Login ya existente: se reutiliza el cliente y se le añade la suscripción.
      customerId = await findCustomerId(username, creds);
      if (customerId === null) {
        throw new PleskError(
          "upstream",
          "Plesk dice que el cliente ya existe pero no se pudo leer su identificador.",
        );
      }
    } else {
      assertResultsOk(addRoot, "Plesk no creó el cliente.");
    }
    const planNode = plan ? `<plan-name>${escapeXml(plan)}</plan-name>` : "";
    const webspaceRoot = await callPlesk(
      packet(
        `<webspace><add>` +
          `<gen_setup>` +
          `<name>${escapeXml(domain)}</name>` +
          `<owner-id>${customerId}</owner-id>` +
          `<htype>vrt_hst</htype>` +
          `<ip_address>${escapeXml(creds.ipAddress)}</ip_address>` +
          `<status>0</status>` +
          `</gen_setup>` +
          `<hosting><vrt_hst>` +
          `<property><name>ftp_login</name><value>${escapeXml(username)}</value></property>` +
          `<property><name>ftp_password</name><value>${escapeXml(input.password)}</value></property>` +
          `<ip_address>${escapeXml(creds.ipAddress)}</ip_address>` +
          `</vrt_hst></hosting>` +
          planNode +
          `</add></webspace>`,
      ),
      creds,
    );
    assertResultsOk(webspaceRoot, "Plesk no creó la suscripción.");
    return { username, domain };
  }

  /**
   * Suspende TODAS las suscripciones del cliente (webspace SET status 16,
   * "desactivado por el administrador"). El login del cliente en Plesk
   * sigue activo; lo que queda desactivado son sus sitios.
   */
  async suspendAccount(input: { username: string; reason?: string }): Promise<void> {
    await this.setSubscriptionsStatus(input.username, 16, "No se encontró ninguna suscripción de ese cliente en Plesk.");
  }

  /** Reactiva TODAS las suscripciones del cliente (status 0). */
  async unsuspendAccount(input: { username: string }): Promise<void> {
    await this.setSubscriptionsStatus(input.username, 0, "No se encontró ninguna suscripción de ese cliente en Plesk.");
  }

  private async setSubscriptionsStatus(
    username: string,
    status: 0 | 16,
    emptyMessage: string,
  ): Promise<void> {
    const creds = await pleskCredentials();
    const root = await callPlesk(
      packet(
        `<webspace><set>` +
          `<filter><owner-login>${escapeXml(username.trim())}</owner-login></filter>` +
          `<values><gen_setup><status>${status}</status></gen_setup></values>` +
          `</set></webspace>`,
      ),
      creds,
    );
    assertResultsOk(root, emptyMessage);
  }

  /**
   * Borra el cliente por su login. Según la documentación, borrar un
   * cliente borra también TODAS sus suscripciones y dominios.
   */
  async terminateAccount(input: { username: string }): Promise<void> {
    const creds = await pleskCredentials();
    const root = await callPlesk(
      packet(
        `<customer><del><filter><login>${escapeXml(input.username.trim())}</login></filter></del></customer>`,
      ),
      creds,
    );
    assertResultsOk(root, "No se encontró ese cliente en Plesk.");
  }

  /**
   * Cambia el plan de TODAS las suscripciones del cliente. El nombre del
   * plan se resuelve a su GUID con service-plan GET, porque
   * SWITCH-SUBSCRIPTION solo acepta plan-guid (ni plan-name ni plan-id).
   */
  async changePackage(input: { username: string; plan: string }): Promise<void> {
    const creds = await pleskCredentials();
    const plan = input.plan.trim();
    if (!plan) {
      throw new PleskError("invalid", "Falta el nombre del plan.");
    }
    const planRoot = await callPlesk(
      packet(
        `<service-plan><get><filter><name>${escapeXml(plan)}</name></filter></get></service-plan>`,
      ),
      creds,
    );
    const planResults = assertResultsOk(planRoot, `No se encontró el plan "${plan}" en Plesk.`);
    const guid = childText(planResults[0], "guid");
    if (!guid) {
      throw new PleskError("invalid", `No se encontró el plan "${plan}" en Plesk.`);
    }
    const listRoot = await callPlesk(
      packet(
        `<webspace><get>` +
          `<filter><owner-login>${escapeXml(input.username.trim())}</owner-login></filter>` +
          `<dataset><gen_info/></dataset>` +
          `</get></webspace>`,
      ),
      creds,
    );
    const subscriptions = assertResultsOk(
      listRoot,
      "No se encontró ninguna suscripción de ese cliente en Plesk.",
    );
    for (const subscription of subscriptions) {
      const id = childText(subscription, "id");
      if (id === null) continue;
      const switchRoot = await callPlesk(
        packet(
          `<webspace><switch-subscription>` +
            `<filter><id>${escapeXml(id)}</id></filter>` +
            `<plan-guid>${escapeXml(guid)}</plan-guid>` +
            `</switch-subscription></webspace>`,
        ),
        creds,
      );
      assertResultsOk(switchRoot, "Plesk no cambió el plan de la suscripción.");
    }
  }

  /**
   * Todas las suscripciones del servidor: dominio, login del propietario
   * y si está suspendida (status distinto de 0: 16, 32, 64 o 256).
   */
  async listAccounts(): Promise<{ username: string; domain: string; suspended: boolean }[]> {
    const creds = await pleskCredentials();
    const root = await callPlesk(
      packet(
        `<webspace><get><filter/><dataset><gen_info/></dataset></get></webspace>`,
      ),
      creds,
      2 * 1024 * 1024,
    );
    const out: { username: string; domain: string; suspended: boolean }[] = [];
    for (const result of resultsOf(root)) {
      if (childText(result, "status") !== "ok") continue;
      const data = child(result, "data");
      const genInfo = child(data, "gen_info");
      const domain = childText(genInfo, "name");
      const ownerLogin = childText(genInfo, "owner-login");
      const status = childText(genInfo, "status");
      if (!domain || !ownerLogin || status === null) continue;
      out.push({ username: ownerLogin, domain, suspended: status !== "0" });
    }
    return out;
  }

  /**
   * Todos los planes de servicio del propietario que autentica (con
   * owner-all, sin filtrar por propietario). Es la operación de solo
   * lectura que usa la prueba de conexión del panel de plugins.
   */
  async listPackages(): Promise<{ name: string }[]> {
    const creds = await pleskCredentials();
    const root = await callPlesk(
      packet(`<service-plan><get><filter/><owner-all/></get></service-plan>`),
      creds,
      2 * 1024 * 1024,
    );
    const out: { name: string }[] = [];
    for (const result of resultsOf(root)) {
      if (childText(result, "status") !== "ok") continue;
      const name = childText(result, "name");
      if (name) out.push({ name });
    }
    return out;
  }
}

export const pleskPanel = new PleskPanel();

/** Adaptador por clave. Hoy solo existe Plesk en este módulo. */
export function getPanel(key = "plesk"): PleskPanel {
  if (key !== "plesk") {
    throw new PleskError(
      "not-supported",
      `El panel "${key}" no tiene adaptador en este módulo.`,
    );
  }
  return pleskPanel;
}
