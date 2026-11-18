import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission } from "@/lib/auth";
import { clientSafeError } from "@/lib/client-error";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";
import { resolveLocalized, validateKbArticle } from "@/lib/content-kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  try {
    await requirePermission("kb:write");
    return null;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sin permiso para esta acción." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * GET: todos los artículos (incluidos los no publicados) y, por slug, si
 * falta la traducción al inglés. El aviso de traducción faltante es SOLO
 * de admin: en público la caída a español es silenciosa.
 */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const articles = await db.kbArticle.findMany({
      orderBy: [{ order: "asc" }, { slug: "asc" }],
    });
    const slugs = [...new Set(articles.map((a) => a.slug))];
    const missingEn = slugs.filter(
      (slug) => resolveLocalized(articles, slug, "en").fellBack,
    );
    return NextResponse.json(
      { articles, missingEn },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    const safe = clientSafeError(e);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const input = {
      slug: String(body?.slug || ""),
      locale: String(body?.locale || ""),
      category: String(body?.category || ""),
      title: String(body?.title || ""),
      body: String(body?.body || ""),
    };
    const err = validateKbArticle(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const order = Number.isFinite(Number(body?.order)) ? Math.trunc(Number(body.order)) : 0;
    const data = {
      slug: input.slug,
      locale: input.locale,
      category: input.category,
      title: input.title.trim(),
      body: input.body,
      order,
      published: body?.published === true,
    };
    const id = body?.id ? String(body.id) : null;
    const article = id
      ? await db.kbArticle.update({ where: { id }, data })
      : await db.kbArticle.create({ data });
    return NextResponse.json({ ok: true, article });
  } catch (e) {
    const safe = clientSafeError(e);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });
  try {
    await db.kbArticle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const safe = clientSafeError(e);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
