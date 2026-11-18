import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edición y borrado de una plantilla de correo. Exige `mail:write`. */

async function assertMailWrite() {
  try {
    await requirePermission("mail:write");
    return null;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sin permiso para gestionar las plantillas de correo." }, { status: 403 });
    }
    return NextResponse.json({ error: "Debes entrar como administrador." }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await assertMailWrite();
  if (denied) return denied;
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const data: { subject?: string; body?: string; variablesJson?: string[]; active?: boolean } = {};
  if (typeof body.subject === "string") {
    if (!body.subject.trim()) {
      return NextResponse.json({ error: "El asunto no puede quedar vacío." }, { status: 400 });
    }
    data.subject = body.subject.trim();
  }
  if (typeof body.body === "string") {
    if (!body.body.trim()) {
      return NextResponse.json({ error: "El cuerpo no puede quedar vacío." }, { status: 400 });
    }
    data.body = body.body;
  }
  if (body.variablesJson !== undefined) {
    if (!Array.isArray(body.variablesJson) || body.variablesJson.some((v) => typeof v !== "string")) {
      return NextResponse.json({ error: "Las variables deben ser una lista de nombres." }, { status: 400 });
    }
    data.variablesJson = body.variablesJson;
  }
  if (typeof body.active === "boolean") data.active = body.active;
  try {
    const row = await db.mailTemplate.update({ where: { id }, data });
    return NextResponse.json({
      ok: true,
      template: { ...row, updatedAt: row.updatedAt.toISOString() },
    });
  } catch {
    return NextResponse.json({ error: "No se encontró la plantilla o no se pudo guardar." }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await assertMailWrite();
  if (denied) return denied;
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await db.mailTemplate.delete({ where: { id } });
    // Sin plantilla activa, el envío cae al texto del código: no se rompe nada.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se encontró la plantilla." }, { status: 404 });
  }
}
