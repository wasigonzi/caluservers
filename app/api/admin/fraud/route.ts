import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Revisión de flags de fraude (Fase 6).
 * Permiso: orders:view — los flags nacen de pedidos y los revisa quien
 * gestiona pedidos (documentado en docs/FRAUDE.md).
 * Acciones: "clear" (aprobar: status "cleared") y "confirm" (confirmar
 * fraude: status "confirmed"). reviewedBy es el email del admin.
 */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const flagId = typeof body?.flagId === "string" ? body.flagId : "";
  if (action !== "clear" && action !== "confirm") {
    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  }
  if (!flagId) {
    return NextResponse.json({ error: "Falta el identificador del flag." }, { status: 400 });
  }
  let email = "admin";
  try {
    const session = await requirePermission("orders:view");
    email = session.email;
  } catch {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }
  const flag = await db.fraudFlag.findUnique({ where: { id: flagId } });
  if (!flag) return NextResponse.json({ error: "Flag no encontrado." }, { status: 404 });
  if (flag.status !== "open") {
    return NextResponse.json({ error: "Ese flag ya fue revisado." }, { status: 409 });
  }
  const updated = await db.fraudFlag.update({
    where: { id: flag.id },
    data: {
      status: action === "clear" ? "cleared" : "confirmed",
      reviewedBy: email,
      reviewedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true, flag: updated });
}
