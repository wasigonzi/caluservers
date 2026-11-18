import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edición y borrado de una respuesta predefinida. Exige `tickets:reply`. */

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await assertTicketsReply();
  if (denied) return denied;
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const data: {
    title?: string;
    body?: string;
    category?: string;
    order?: number;
    active?: boolean;
  } = {};
  if (typeof body.title === "string") {
    if (!body.title.trim()) {
      return NextResponse.json({ error: "El título no puede quedar vacío." }, { status: 400 });
    }
    data.title = body.title.trim();
  }
  if (typeof body.body === "string") {
    if (!body.body.trim()) {
      return NextResponse.json({ error: "El texto no puede quedar vacío." }, { status: 400 });
    }
    data.body = body.body;
  }
  if (typeof body.category === "string") data.category = body.category.trim() || "general";
  if (typeof body.order === "number" && Number.isFinite(body.order)) {
    data.order = Math.trunc(body.order);
  }
  if (typeof body.active === "boolean") data.active = body.active;
  try {
    const row = await db.cannedReply.update({ where: { id }, data });
    return NextResponse.json({
      ok: true,
      reply: { ...row, updatedAt: row.updatedAt.toISOString() },
    });
  } catch {
    return NextResponse.json({ error: "No se encontró la respuesta o no se pudo guardar." }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await assertTicketsReply();
  if (denied) return denied;
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await db.cannedReply.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se encontró la respuesta." }, { status: 404 });
  }
}
