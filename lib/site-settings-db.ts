import "server-only";
import { db } from "@/lib/db";
import { reportDbError } from "@/lib/db-errors";
import {
  DEFAULT_SITE_SETTINGS,
  parseSiteSettings,
  validateSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";
import { commitSiteSettings } from "@/lib/writes";

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
  await commitSiteSettings(settings);
  return settings;
}
