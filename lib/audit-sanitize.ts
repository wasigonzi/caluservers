/**
 * Sanitizador de auditoría (Fase 0).
 *
 * Todo lo que se escribe en AdminAudit.details y CommerceEvent.details pasa
 * por `sanitizeAudit` antes de llegar a la base. El diario de auditoría lo lee
 * el panel de administración y puede exportarse: nunca debe guardar
 * contraseñas, tokens, hashes, secretos ni URLs con credenciales.
 *
 * Reglas:
 * - Cadenas: se redactan pares `clave=valor` con clave sensible y cualquier
 *   URL con credenciales (`scheme://usuario:clave@host`).
 * - Objetos: solo sobreviven los campos de la allowlist `ALLOWED_FIELDS`;
 *   el resto se descarta. Un campo sensible se elimina aunque esté en la
 *   allowlist. Si un llamador necesita un campo nuevo, debe añadirlo aquí.
 * - La función nunca lanza: ante cualquier valor inesperado devuelve
 *   "[redacted]" o undefined.
 */

// "author" NO es sensible: el alternante de "auth" exige que sea palabra
// propia (auth, x-auth, auth-token...), no el prefijo de "author".
const SENSITIVE_KEY =
  /password|passwd|pwd|token|secret|hash|api[-_]?key|credential|private[-_]?key|access[-_]?key|session|cookie|bearer/i;

function isSensitiveKey(key: string): boolean {
  if (SENSITIVE_KEY.test(key)) return true;
  return /(^|[-_])auth([-_]|$)/i.test(key);
}

/** Campos que pueden aparecer en un `details` estructurado. */
const ALLOWED_FIELDS = new Set([
  "action",
  "actor",
  "entityId",
  "plan",
  "planId",
  "cents",
  "currency",
  "tax",
  "taxMode",
  "domain",
  "provider",
  "invoice",
  "invoiceId",
  "number",
  "order",
  "orderId",
  "status",
  "from",
  "to",
  "package",
  "user",
  "adopted",
  "source",
  "chars",
  "path",
  "count",
  "reason",
  "permission",
  "id",
  "method",
  "kind",
  // Fase 6, frente B (auditoría unificada y alertas): referencias al
  // recurso de la fila de AuditLog / de la alerta. No son sensibles:
  // son identificadores internos, nunca contraseñas ni secretos.
  "service",
  "subscription",
  "severity",
  "ruleKey",
]);

/** `scheme://usuario[:clave]@host` -> `scheme://[redacted]@host`. */
const URL_WITH_CREDENTIALS =
  /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)(?:[^\s/@:]+(?::[^\s/@]*)?@)/g;

/** `clave_sensible=valor` (estilo `a=1;b=2`, `a=1, b=2` o dentro de texto
 *  libre como `note=password=x`) -> `clave=[redacted]`. El `=` también es
 *  separador para cazar secretos pegados por un humano en una nota. */
const SENSITIVE_PAIR = new RegExp(
  `(^|[;,&\\s=])([A-Za-z0-9_.\\-]*?(?:password|passwd|pwd|token|secret|hash|api[-_]?key|credential|private[-_]?key|access[-_]?key|session|cookie|bearer)[A-Za-z0-9_.\\-]*|(?:[A-Za-z0-9_.\\-]*[-_])?auth(?:[-_][A-Za-z0-9_.\\-]*)?)\\s*=\\s*[^;,\\s]+`,
  "gi",
);

/** `"clave_sensible": "valor"` (JSON) -> `"clave_sensible": "[redacted]"`. */
const SENSITIVE_JSON_PAIR = new RegExp(
  `("([^"]*(?:password|passwd|pwd|token|secret|hash|api[-_]?key|credential|private[-_]?key|access[-_]?key|session|cookie|bearer)[^"]*)"\\s*:\\s*)("[^"]*"|\\d+|true|false|null)`,
  "gi",
);

function scrubString(value: string): string {
  return value
    .replace(URL_WITH_CREDENTIALS, "$1[redacted]@")
    .replace(SENSITIVE_PAIR, "$1$2=[redacted]")
    .replace(SENSITIVE_JSON_PAIR, '$1"[redacted]"');
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth <= 0) return "[redacted]";
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item, depth - 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) continue;
      if (!ALLOWED_FIELDS.has(key)) continue;
      const clean = sanitizeValue(entry, depth - 1);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  return "[redacted]";
}

/**
 * Limpia un `details` de auditoría. Acepta texto (el caso habitual) u objeto.
 * Devuelve siempre una cadena (vacía cuando no queda nada que guardar), para
 * que sirva tanto en AdminAudit.details (nullable) como en
 * CommerceEvent.details (obligatorio).
 */
export function sanitizeAudit(details: unknown): string {
  if (details === null || details === undefined) return "";
  if (typeof details === "string") return scrubString(details);
  try {
    const clean = sanitizeValue(details, 5);
    if (clean === undefined) return "";
    return JSON.stringify(clean);
  } catch {
    return "[redacted]";
  }
}
