import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Respuestas predefinidas para tickets (Fase 5, frente C). Usan el permiso
 * existente `tickets:reply`: quien puede responder un ticket puede verlas
 * e insertarlas, y gestionarlas. GET acepta `?active=true` para el
 * desplegable del formulario de respuesta.
 */

async function assertTicketsReply() {
  try {
    await requirePermission("tickets:reply");
    return null;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sin permiso para responder tickets." }, { status: 403 });
    }
    return NextResponse.json({ error: "Debes entrar como administrador." }, { status: 401 });
  }
}

function publicReply(row: {
  id: string;
  title: string;
  body: string;
  locale: string;
  category: string;
  order: number;
  active: boolean;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    locale: row.locale,
    category: row.category,
    order: row.order,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const denied = await assertTicketsReply();
  if (denied) return denied;
  const locale = req.nextUrl.searchParams.get("locale") || "es";
  const activeOnly = req.nextUrl.searchParams.get("active") === "true";
  try {
    const rows = await db.cannedReply.findMany({
      where: { locale, ...(activeOnly ? { active: true } : {}) },
      orderBy: [{ order: "asc" }, { title: "asc" }],
    });
    return NextResponse.json({ ok: true, replies: rows.map(publicReply) });
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar las respuestas." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await assertTicketsReply();
  if (denied) return denied;
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body : "";
  const locale = typeof body.locale === "string" ? body.locale.trim() : "es";
  const category = typeof body.category === "string" ? body.category.trim() : "general";
  const order = typeof body.order === "number" && Number.isFinite(body.order) ? Math.trunc(body.order) : 0;
  if (!title || !text.trim()) {
    return NextResponse.json({ error: "El título y el texto son obligatorios." }, { status: 400 });
  }
  if (locale !== "es" && locale !== "en") {
    return NextResponse.json({ error: "El idioma debe ser es o en." }, { status: 400 });
  }
  try {
    const row = await db.cannedReply.create({
      data: { title, body: text, locale, category, order, active: body.active !== false },
    });
    return NextResponse.json({ ok: true, reply: publicReply(row) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar la respuesta." }, { status: 503 });
  }
}
