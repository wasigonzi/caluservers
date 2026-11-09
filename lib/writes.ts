import type { CatalogPayload } from "./catalog-validate";
import { db } from "./db";
import { mergePagePayload } from "./page-content";
import { settingsToRows, type SiteSettings } from "./site-settings";

/** Content write and audit journal commit together. A journal failure rolls the write back. */
export async function commitSiteSettings(settings: SiteSettings): Promise<void> {
  const rows = settingsToRows(settings);
  await db.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.siteSetting.upsert({
        where: { key: row.key },
        create: { key: row.key, value: row.value as object },
        update: { value: row.value as object },
      });
    }
    await tx.adminAudit.create({
      data: {
        action: "site.settings.updated",
        details: "Site settings updated (no secrets)",
      },
    });
  });
}

export async function commitPageContent(
  path: string,
  payload: Record<string, string>,
): Promise<Record<string, string>> {
  const merged = mergePagePayload(path, payload);
  await db.$transaction(async (tx) => {
    await tx.pageContent.upsert({
      where: { path },
      create: { path, payload: merged },
      update: { payload: merged },
    });
    await tx.adminAudit.create({
      data: {
        action: "page.content.updated",
        entityId: path,
        details: `Page content updated for ${path}`,
      },
    });
  });
  return merged;
}

export async function commitCatalog(
  parsed: CatalogPayload,
  action: "catalog.updated" | "catalog.restored",
  details: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.catalogConfig.upsert({
      where: { id: "default" },
      create: { id: "default", payload: parsed as object },
      update: { payload: parsed as object },
    });
    await tx.adminAudit.create({ data: { action, details } });
  });
}
