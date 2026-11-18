import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission } from "@/lib/auth";
import { clientSafeError } from "@/lib/client-error";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";
import {
  resolveLocalized,
  validateContentItem,
  type ContentKind,
} from "@/lib/content-kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  try {
    await requirePermission("content:write");
    return null;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sin permiso para esta acción." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * GET: lista ítems (filtros ?kind=&locale=) y secciones. Incluye los no
 * publicados y, por slug, si falta la traducción al inglés (aviso SOLO
 * en admin: en público la caída a español es silenciosa).
 */
export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const params = req.nextUrl.searchParams;
  const kind = params.get("kind") || undefined;
  const locale = params.get("locale") || undefined;
  try {
    const [items, sections] = await Promise.all([
      db.contentItem.findMany({
        where: { ...(kind ? { kind } : {}), ...(locale ? { locale } : {}) },
        orderBy: [{ kind: "asc" }, { order: "asc" }, { slug: "asc" }],
      }),
      db.contentSection.findMany({ orderBy: [{ key: "asc" }, { locale: "asc" }] }),
    ]);
    const slugs = [...new Set(items.map((i) => i.slug))];
    const missingEn = slugs.filter(
      (slug) => resolveLocalized(items, slug, "en").fellBack,
    );
    return NextResponse.json(
      { items, sections, missingEn },
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
    if (body?.type === "section") {
      const key = String(body?.key || "");
      const locale = String(body?.locale || "");
      if (!["testimonials", "partners", "projects", "faq"].includes(key)) {
        return NextResponse.json({ error: "Sección no soportada." }, { status: 400 });
      }
      if (locale !== "es" && locale !== "en") {
        return NextResponse.json({ error: "Idioma no soportado (es/en)." }, { status: 400 });
      }
      const title = String(body?.title || "");
      if (!title.trim() || title.length > 200 || /[<>]/.test(title)) {
        return NextResponse.json({ error: "Título inválido." }, { status: 400 });
      }
      const section = await db.contentSection.upsert({
        where: { key_locale: { key, locale } },
        create: {
          key,
          locale,
          title: title.trim(),
          subtitle: body?.subtitle ? String(body.subtitle).slice(0, 300) : null,
          visible: body?.visible !== false,
        },
        update: {
          title: title.trim(),
          subtitle: body?.subtitle ? String(body.subtitle).slice(0, 300) : null,
          visible: body?.visible !== false,
        },
      });
      return NextResponse.json({ ok: true, section });
    }

    // Ítem de contenido (crear o editar).
    const input = {
      kind: String(body?.kind || ""),
      slug: String(body?.slug || ""),
      locale: String(body?.locale || ""),
      title: String(body?.title || ""),
      body: String(body?.body || ""),
    };
    const err = validateContentItem(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const order = Number.isFinite(Number(body?.order)) ? Math.trunc(Number(body.order)) : 0;
    const fieldsJson =
      body?.fieldsJson && typeof body.fieldsJson === "object" ? body.fieldsJson : undefined;
    const data = {
      kind: input.kind as ContentKind,
      slug: input.slug,
      locale: input.locale,
      title: input.title.trim(),
      body: input.body,
      ...(fieldsJson ? { fieldsJson } : {}),
      order,
      published: body?.published === true,
    };
    const id = body?.id ? String(body.id) : null;
    const item = id
      ? await db.contentItem.update({ where: { id }, data })
      : await db.contentItem.create({ data });
    return NextResponse.json({ ok: true, item });
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
    await db.contentItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const safe = clientSafeError(e);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
