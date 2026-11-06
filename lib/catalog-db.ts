import "server-only";
import { db } from "@/lib/db";
import { SEED_CATALOG, type Catalog } from "@/lib/catalog";
import {
  parseCatalogPayload,
  seedCatalogPayload,
  validateCatalogPayload,
  type CatalogPayload,
} from "@/lib/catalog-validate";
import { getSiteSettings } from "@/lib/site-settings-db";

export async function getCatalogPayload(): Promise<CatalogPayload> {
  try {
    const row = await db.catalogConfig.findUnique({ where: { id: "default" } });
    if (!row) return seedCatalogPayload();
    const parsed = parseCatalogPayload(row.payload);
    return parsed ?? seedCatalogPayload();
  } catch {
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
  await db.catalogConfig.upsert({
    where: { id: "default" },
    create: { id: "default", payload: parsed as object },
    update: { payload: parsed as object },
  });
  await db.adminAudit.create({
    data: {
      action: "catalog.updated",
      details: `plans=${parsed.webHosting.length + parsed.vps.length + parsed.dedicated.length}`,
    },
  });
  return parsed;
}

export async function restoreCatalogPayload(): Promise<CatalogPayload> {
  const seed = seedCatalogPayload();
  await db.catalogConfig.upsert({
    where: { id: "default" },
    create: { id: "default", payload: seed as object },
    update: { payload: seed as object },
  });
  await db.adminAudit.create({
    data: { action: "catalog.restored", details: "Restored SEED_CATALOG" },
  });
  return seed;
}

export function defaultCatalog(): Catalog {
  return structuredClone(SEED_CATALOG);
}
