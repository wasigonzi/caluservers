import "server-only";
import { db } from "@/lib/db";
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
  } catch {
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
  } catch {
    // DB ausente / migración pendiente → defaults
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const missing =
      /does not exist|P2021|PageContent/i.test(msg) ||
      /Can't reach database/i.test(msg);
    return {
      ok: false,
      missingMigration: missing,
      message: missing
        ? "Falta migración PageContent o no hay conexión a la base de datos. La UI usará defaults hasta aplicar: npx prisma migrate deploy"
        : msg.slice(0, 200),
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
