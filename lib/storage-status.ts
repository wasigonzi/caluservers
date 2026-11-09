import { classifyDbError } from "./db-errors";

const MODEL_NAME = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;

function own(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
  } catch {
    return undefined;
  }
}

function modelName(error: unknown): string | null {
  const queue: unknown[] = [error];
  const seen = new Set<object>();
  for (let index = 0; index < queue.length && index < 8; index += 1) {
    const item = queue[index];
    if (typeof item !== "object" || item === null || seen.has(item)) continue;
    seen.add(item);
    const meta = own(item, "meta");
    const name = own(meta, "modelName");
    if (typeof name === "string" && MODEL_NAME.test(name)) return name;
    for (const key of ["cause", "meta"]) {
      const nested = own(item, key);
      if (typeof nested === "object" && nested !== null) queue.push(nested);
    }
  }
  return null;
}

/** Texto seguro para una pantalla que no pudo leer. No afirma éxito ni inventa filas. */
export function storageFailureMessage(error: unknown): string {
  const classified = classifyDbError(error);
  const model = modelName(error);
  if (classified.missingMigration) {
    return model
      ? `Falta la tabla del modelo ${model}. Esta pantalla no puede mostrar esos datos y no inventa registros.`
      : "Falta una tabla que esta pantalla necesita. No se inventan registros.";
  }
  if (classified.category === "authentication" || classified.category === "permission") {
    return "La base de datos rechazó la lectura. No se muestran datos de ejemplo.";
  }
  if (classified.category === "unreachable" || classified.category === "connection" || classified.category === "timeout" || classified.category === "connection_closed") {
    return "La base de datos no respondió. No se muestran datos de ejemplo.";
  }
  return "Esta pantalla no pudo leer la base de datos. No se muestran datos de ejemplo.";
}

export async function loadOrExplain<T>(load: () => Promise<T>): Promise<
  | { ok: true; data: T }
  | { ok: false; message: string }
> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    return { ok: false, message: storageFailureMessage(error) };
  }
}
