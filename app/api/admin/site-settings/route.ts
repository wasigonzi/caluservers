import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";
import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings-db";
import {
  DEFAULT_SITE_SETTINGS,
  parseSiteSettings,
  validateSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    // Merge over defaults via the same row parser used publicly.
    const candidate = parseSiteSettings(
      [
        { key: "whmcs", value: (body as SiteSettings).whmcs },
        { key: "theme", value: (body as SiteSettings).theme },
        { key: "network_status", value: (body as SiteSettings).networkStatus },
        { key: "contact", value: (body as SiteSettings).contact },
        { key: "social", value: (body as SiteSettings).social },
        { key: "content", value: (body as SiteSettings).content },
        { key: "visibility", value: (body as SiteSettings).visibility },
        { key: "appearance", value: (body as SiteSettings).appearance },
      ],
      DEFAULT_SITE_SETTINGS,
    );
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
