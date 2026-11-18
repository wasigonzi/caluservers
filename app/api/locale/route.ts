import { NextRequest, NextResponse } from "next/server";
import { normalizeLocale } from "@/lib/i18n";
import { localeCookieOptions } from "@/lib/i18n/server";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Selector de idioma público: guarda la cookie persistente `calu-locale`. */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const locale = normalizeLocale(body?.locale);
    const res = NextResponse.json({ ok: true, locale });
    res.cookies.set("calu-locale", locale, localeCookieOptions);
    return res;
  } catch {
    return NextResponse.json({ error: "Idioma inválido." }, { status: 400 });
  }
}
