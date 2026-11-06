/** Bounded, allowlisted diagnostics. Never inspect or serialize message/stack. */
const CATEGORIES = {
  P1000: "authentication", P1001: "unreachable", P1002: "timeout",
  P1003: "configuration", P1008: "timeout", P1009: "configuration",
  P1010: "permission", P1011: "tls", P1012: "configuration",
  P1013: "configuration", P1014: "configuration", P1015: "configuration",
  P1016: "configuration", P1017: "connection_closed",
  P2002: "constraint", P2003: "constraint", P2010: "query",
  P2021: "missing_table", P2022: "missing_column", P2024: "pool_timeout",
  P2028: "transaction", P2034: "transaction",
  "42P01": "missing_table", "42703": "missing_column",
  "28P01": "authentication", "28000": "authentication",
  "08000": "connection", "08001": "connection", "08003": "connection",
  "08004": "connection", "08006": "connection", "08007": "connection",
  "08P01": "connection", "53300": "capacity", "53400": "capacity",
  "57014": "timeout", "55P03": "transaction", "40001": "transaction",
  "40P01": "transaction", "42501": "permission",
} as const;

type SafeCode = keyof typeof CATEGORIES;
type Category = (typeof CATEGORIES)[SafeCode] | "unknown";
export type SafeDbError = {
  codes: SafeCode[];
  category: Category;
  missingMigration: boolean;
};

/** Do not invoke accessors, coercion, or traverse arbitrary payload properties. */
function ownValue(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
  } catch {
    return undefined;
  }
}

export function classifyDbError(error: unknown): SafeDbError {
  const queue: unknown[] = [error];
  const seen = new Set<object>();
  const found = new Set<SafeCode>();
  // Includes Prisma initialization.errorCode and raw-query meta.code/SQLSTATE.
  for (let index = 0; index < queue.length && index < 16; index++) {
    const item = queue[index];
    if (typeof item !== "object" || item === null || seen.has(item)) continue;
    seen.add(item);
    for (const key of ["code", "errorCode", "sqlState", "sqlstate", "originalCode"]) {
      const code = ownValue(item, key);
      if (typeof code === "string" && Object.hasOwn(CATEGORIES, code)) {
        found.add(code as SafeCode);
      }
    }
    for (const key of ["cause", "meta", "originalError", "driverAdapterError"]) {
      const nested = ownValue(item, key);
      if (typeof nested === "object" && nested !== null && queue.length < 64) queue.push(nested);
    }
  }
  const missingCode = found.has("P2021") ? "P2021" : found.has("42P01") ? "42P01" : null;
  const priority: SafeCode[] = missingCode ? [missingCode] : [];
  const codes = [...new Set<SafeCode>([...priority, ...found])].slice(0, 8);
  return {
    codes,
    category: missingCode ? "missing_table" : codes.length ? CATEGORIES[codes[0]] : "unknown",
    missingMigration: missingCode !== null,
  };
}

export function safeDbUrlFlags(value: string | undefined) {
  const flags = { present: Boolean(value), postgresProtocol: false, sslmodePresent: false, pgbouncerPresent: false };
  if (!value) return flags;
  try {
    const url = new URL(value);
    flags.postgresProtocol = ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname);
    flags.sslmodePresent = url.searchParams.has("sslmode");
    flags.pgbouncerPresent = url.searchParams.has("pgbouncer");
  } catch {
    // URL parser errors can contain the input. Never log the exception.
  }
  return flags;
}

type SafeLog = { codes: SafeCode[]; category: Category; url: ReturnType<typeof safeDbUrlFlags> };
type Logger = (event: string, details: SafeLog) => void;
const recent = new Map<string, number>();

export function reportDbError(
  error: unknown,
  databaseUrl: string | undefined,
  logger: Logger = console.error,
): SafeDbError {
  const summary = classifyDbError(error);
  const details: SafeLog = { codes: summary.codes, category: summary.category, url: safeDbUrlFlags(databaseUrl) };
  // Bound repetition per warm worker; no raw error or connection data in the key.
  const key = JSON.stringify(details);
  const now = Date.now();
  if (logger !== console.error || now - (recent.get(key) ?? 0) >= 30_000) {
    if (recent.size >= 32) recent.clear();
    recent.set(key, now);
    try { logger("cms_db_failure", details); } catch { /* Logging must not replace the original error. */ }
  }
  return summary;
}
