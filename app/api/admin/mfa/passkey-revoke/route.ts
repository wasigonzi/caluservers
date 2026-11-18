import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";
import { adminOwnerId } from "@/lib/webauthn";

export const runtime = "nodejs";

/** Revoca una passkey del administrador (la borra de PasskeyCredential). */
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
  const credentialId =
    typeof (body as { credentialId?: unknown })?.credentialId === "string"
      ? (body as { credentialId: string }).credentialId
      : "";
  if (!credentialId) return NextResponse.json({ error: "Falta credentialId." }, { status: 400 });
  const ownerId = await adminOwnerId(session.email);
  try {
    const deleted = await db.passkeyCredential.deleteMany({
      where: { ownerType: "admin", ownerId, credentialId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Passkey no encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo revocar la passkey." }, { status: 500 });
  }
}
