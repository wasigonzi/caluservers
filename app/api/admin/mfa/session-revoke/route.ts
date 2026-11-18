import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminSession, sessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";

/**
 * Revoca una sesión activa del administrador actual. No se puede revocar
 * la sesión desde la que se hace la petición (esa se cierra con logout).
 */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo no válido." }, { status: 400 });
  }
  const id = typeof (body as { id?: unknown })?.id === "string" ? (body as { id: string }).id : "";
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  let currentTokenHash: string | null = null;
  try {
    const token = (await cookies()).get(sessionCookie)?.value ?? null;
    if (token) currentTokenHash = createHash("sha256").update(token).digest("hex");
  } catch {
    currentTokenHash = null;
  }
  try {
    const target = await db.adminSession.findUnique({
      where: { id },
      select: { id: true, adminUserId: true, tokenHash: true, revokedAt: true },
    });
    // La sesión debe ser del mismo admin: con AdminUser, su id; con el
    // fallback por entorno, las sesiones sin AdminUser (adminUserId null).
    const own = target && (session.userId ? target.adminUserId === session.userId : target.adminUserId === null);
    if (!own || !target) {
      return NextResponse.json({ error: "Sesión no encontrada." }, { status: 404 });
    }
    if (currentTokenHash && target.tokenHash === currentTokenHash) {
      return NextResponse.json(
        { error: "No puedes revocar la sesión actual desde aquí; usa salir." },
        { status: 400 },
      );
    }
    if (target.revokedAt) return NextResponse.json({ ok: true, alreadyRevoked: true });
    await db.adminSession.update({
      where: { id: target.id },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo revocar la sesión." }, { status: 500 });
  }
}
