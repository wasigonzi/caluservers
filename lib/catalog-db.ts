import "server-only";
import { db } from "@/lib/db";
import { reportDbError } from "@/lib/db-errors";
import { SEED_CATALOG, type Catalog } from "@/lib/catalog";
import {
  parseCatalogPayload,
  seedCatalogPayload,
  validateCatalogPayload,
  type CatalogPayload,
} from "@/lib/catalog-validate";
import { getSiteSettings } from "@/lib/site-settings-db";
import { commitCatalog } from "@/lib/writes";

export async function getCatalogPayload(): Promise<CatalogPayload> {
  try {
    const row = await db.catalogConfig.findUnique({ where: { id: "default" } });
    if (!row) return seedCatalogPayload();
    const parsed = parseCatalogPayload(row.payload);
    return parsed ?? seedCatalogPayload();
  } catch (error) {
    reportDbError(error, process.env.DATABASE_URL);
    return seedCatalogPayload();
  }
}

export async function getPublicCatalog(): Promise<Catalog> {
  const [payload, settings] = await Promise.all([
    getCatalogPayload(),
    getSiteSettings(),
  ]);
  return { ...payload, settings };
}

export async function saveCatalogPayload(
  input: unknown,
): Promise<CatalogPayload> {
  const parsed = parseCatalogPayload(input);
  if (!parsed) throw new Error("Catálogo inválido");
  const err = validateCatalogPayload(parsed);
  if (err) throw new Error(err);
  await commitCatalog(
    parsed,
    "catalog.updated",
    `plans=${parsed.webHosting.length + parsed.vps.length + parsed.dedicated.length}`,
  );
  return parsed;
}

export async function restoreCatalogPayload(): Promise<CatalogPayload> {
  const seed = seedCatalogPayload();
  await commitCatalog(seed, "catalog.restored", "Restored SEED_CATALOG");
  return seed;
}

export function defaultCatalog(): Catalog {
  return structuredClone(SEED_CATALOG);
}
