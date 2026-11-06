import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";
import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings-db";
import {
  DEFAULT_SITE_SETTINGS,
  parseSiteSettings,
  settingsToRows,
  validateSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function coerceSettings(body: unknown): SiteSettings {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return structuredClone(DEFAULT_SITE_SETTINGS);
  }
  const b = body as SiteSettings;
  return parseSiteSettings(settingsToRows(b), DEFAULT_SITE_SETTINGS);
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await getSiteSettings();
  return NextResponse.json(
    { settings, defaults: DEFAULT_SITE_SETTINGS },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    if (body?.action === "restore") {
      const saved = await saveSiteSettings(
        structuredClone(DEFAULT_SITE_SETTINGS),
      );
      return NextResponse.json({ ok: true, settings: saved });
    }
    const candidate = coerceSettings(body?.settings ?? body);
    const err = validateSiteSettings(candidate);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const saved = await saveSiteSettings(candidate);
    return NextResponse.json({ ok: true, settings: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
