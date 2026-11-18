import { NextRequest, NextResponse } from "next/server";
import { customerSession } from "@/lib/customer-session";
import { db } from "@/lib/db";
import { localeCookieOptions } from "@/lib/i18n/server";
import { normalizeLocale } from "@/lib/i18n";
import {
  normalizePortalDensity,
  normalizePortalTheme,
} from "@/lib/portal-theme";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preferencias del cliente: idioma, diseño y densidad del portal. */
export async function GET() {
  const session = await customerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { locale: true, portalTheme: true, portalDensity: true },
  });
  return NextResponse.json({
    locale: user?.locale ?? "es",
    portalTheme: user?.portalTheme ?? "default",
    portalDensity: user?.portalDensity ?? "comfortable",
  });
}

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await customerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const data: { locale?: string; portalTheme?: string; portalDensity?: string } = {};
    if (body?.locale !== undefined) data.locale = normalizeLocale(body.locale);
    if (body?.portalTheme !== undefined) data.portalTheme = normalizePortalTheme(body.portalTheme);
    if (body?.portalDensity !== undefined) {
      data.portalDensity = normalizePortalDensity(body.portalDensity);
    }
    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "Nada que guardar." }, { status: 400 });
    }
    const user = await db.user.update({
      where: { id: session.user.id },
      data,
      select: { locale: true, portalTheme: true, portalDensity: true },
    });
    const res = NextResponse.json({
      locale: user.locale,
      portalTheme: user.portalTheme,
      portalDensity: user.portalDensity,
    });
    // La cookie mantiene el idioma en las rutas públicas; la preferencia
    // guardada manda en el portal cuando no hay cookie explícita.
    if (data.locale) res.cookies.set("calu-locale", data.locale, localeCookieOptions);
    return res;
  } catch {
    return NextResponse.json({ error: "No se pudieron guardar las preferencias." }, { status: 503 });
  }
}
