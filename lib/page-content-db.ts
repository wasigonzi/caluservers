import "server-only";
import { db } from "@/lib/db";
import { reportDbError } from "@/lib/db-errors";
import {
  PAGE_DEFS,
  PAGE_PATHS,
  defaultPayload,
  mergePagePayload,
  validatePagePayload,
} from "@/lib/page-content";
import { commitPageContent } from "@/lib/writes";

export type PageContentMap = Record<string, Record<string, string>>;

export async function getPageContent(path: string): Promise<Record<string, string>> {
  try {
    const row = await db.pageContent.findUnique({ where: { path } });
    return mergePagePayload(path, row?.payload ?? null);
  } catch (error) {
    reportDbError(error, process.env.DATABASE_URL);
    return defaultPayload(path);
  }
}

export async function getAllPageContent(): Promise<PageContentMap> {
  const out: PageContentMap = {};
  for (const path of PAGE_PATHS) out[path] = defaultPayload(path);
  try {
    const rows = await db.pageContent.findMany();
    for (const row of rows) {
      if (PAGE_PATHS.includes(row.path)) {
        out[row.path] = mergePagePayload(row.path, row.payload);
      }
    }
  } catch (error) {
    reportDbError(error, process.env.DATABASE_URL);
    // DB no usable: preserve documented public fallback.
  }
  return out;
}

export async function savePageContent(
  path: string,
  payload: Record<string, string>,
): Promise<Record<string, string>> {
  const err = validatePagePayload(path, payload);
  if (err) throw new Error(err);
  return commitPageContent(path, payload);
}

export async function restorePageContent(path: string): Promise<Record<string, string>> {
  const defaults = defaultPayload(path);
  return savePageContent(path, defaults);
}

export async function cmsStorageReady(): Promise<{
  ok: boolean;
  missingMigration: boolean;
  message: string;
}> {
  try {
    await db.siteSetting.findFirst({ select: { key: true } });
    await db.catalogConfig.findFirst({ select: { id: true } });
    await db.pageContent.findFirst({ select: { path: true } });
    await db.adminAudit.findFirst({ select: { id: true } });
    await db.integrationConfig.findFirst({ select: { id: true } });
    return { ok: true, missingMigration: false, message: "Almacenamiento listo" };
  } catch (error) {
    const { missingMigration } = reportDbError(error, process.env.DATABASE_URL);
    return {
      ok: false,
      missingMigration,
      message: missingMigration
        ? "Faltan tablas de contenido o de auditoría. Ejecuta prisma migrate deploy. El guardado está desactivado."
        : "Base de datos no usable. El guardado está desactivado.",
    };
  }
}

export async function pageContentDbReady() {
  return cmsStorageReady();
}

export function pageCatalogMeta() {
  return PAGE_DEFS.map((p) => ({
    path: p.path,
    label: p.label,
    description: p.description,
    fieldCount: p.fields.length,
  }));
}
