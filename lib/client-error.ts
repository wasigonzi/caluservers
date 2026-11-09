import { classifyDbError } from "./db-errors";

function ownName(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  try {
    const name = Object.getOwnPropertyDescriptor(error, "name")?.value;
    return typeof name === "string" ? name : "";
  } catch {
    return "";
  }
}

/** Safe API body. Database failures never include Prisma text, SQL or URLs. */
export function clientSafeError(error: unknown): {
  status: number;
  body: { ok: false; error: string; missingMigration?: boolean };
} {
  const summary = classifyDbError(error);
  const dbFailure =
    summary.codes.length > 0 ||
    summary.category !== "unknown" ||
    ownName(error).startsWith("Prisma");
  if (dbFailure) {
    return {
      status: 503,
      body: {
        ok: false,
        missingMigration: summary.missingMigration,
        error: summary.missingMigration
          ? "Faltan tablas de almacenamiento. Aplica las migraciones. No se publicaron cambios."
          : "La base de datos no completó el guardado. No se publicaron cambios.",
      },
    };
  }
  const message = error instanceof Error ? error.message : "";
  if (
    message &&
    message.length <= 240 &&
    !/[<>]/.test(message) &&
    !/prisma|postgres:\/\//i.test(message)
  ) {
    return { status: 400, body: { ok: false, error: message } };
  }
  return { status: 400, body: { ok: false, error: "No se pudo guardar." } };
}
