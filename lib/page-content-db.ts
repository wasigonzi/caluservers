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
  const merged = mergePagePayload(path, payload);
  await db.pageContent.upsert({
    where: { path },
    create: { path, payload: merged },
    update: { payload: merged },
  });
  await db.adminAudit.create({
    data: {
      action: "page.content.updated",
      entityId: path,
      details: `Page content updated for ${path}`,
    },
  });
  return merged;
}

export async function restorePageContent(path: string): Promise<Record<string, string>> {
  const defaults = defaultPayload(path);
  return savePageContent(path, defaults);
}

export async function pageContentDbReady(): Promise<{
  ok: boolean;
  missingMigration: boolean;
  message: string;
}> {
  try {
    await db.pageContent.findMany({ take: 1 });
    return { ok: true, missingMigration: false, message: "PageContent listo" };
  } catch (error) {
    const { missingMigration } = reportDbError(error, process.env.DATABASE_URL);
    return {
      ok: false,
      missingMigration,
      message: missingMigration
        ? "Falta una tabla requerida del CMS. El guardado no está disponible; revisar migraciones."
        : "BD no usable. El guardado no está disponible. Consultar los registros del servidor.",
    };
  }
}

export function pageCatalogMeta() {
  return PAGE_DEFS.map((p) => ({
    path: p.path,
    label: p.label,
    description: p.description,
    fieldCount: p.fields.length,
  }));
}
