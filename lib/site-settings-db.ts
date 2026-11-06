import "server-only";
import { db } from "@/lib/db";
import { reportDbError } from "@/lib/db-errors";
import {
  DEFAULT_SITE_SETTINGS,
  parseSiteSettings,
  settingsToRows,
  validateSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";

export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const rows = await db.siteSetting.findMany();
    return parseSiteSettings(
      rows.map((r) => ({ key: r.key, value: r.value })),
      DEFAULT_SITE_SETTINGS,
    );
  } catch (error) {
    reportDbError(error, process.env.DATABASE_URL);
    // DB ausente o migración pendiente: defaults documentados.
    return structuredClone(DEFAULT_SITE_SETTINGS);
  }
}

export async function saveSiteSettings(settings: SiteSettings): Promise<SiteSettings> {
  const error = validateSiteSettings(settings);
  if (error) throw new Error(error);
  const rows = settingsToRows(settings);
  await db.$transaction(
    rows.map((row) =>
      db.siteSetting.upsert({
        where: { key: row.key },
        create: { key: row.key, value: row.value as object },
        update: { value: row.value as object },
      }),
    ),
  );
  await db.adminAudit.create({
    data: {
      action: "site.settings.updated",
      details: "Site settings updated (no secrets)",
    },
  });
  return settings;
}
