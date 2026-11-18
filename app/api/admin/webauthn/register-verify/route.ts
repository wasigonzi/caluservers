import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";
import { verifyAdminRegistration } from "@/lib/webauthn";

export const runtime = "nodejs";

/** Verifica el registro y guarda la credencial en PasskeyCredential. */
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
  if (!body || typeof body !== "object" || typeof (body as { id?: unknown }).id !== "string") {
    return NextResponse.json({ error: "Respuesta WebAuthn no válida." }, { status: 400 });
  }
  try {
    const result = await verifyAdminRegistration(
      { email: session.email },
      body as Parameters<typeof verifyAdminRegistration>[1],
    );
    if (!result.verified) {
      return NextResponse.json(
        { error: "No se pudo verificar la passkey." },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: true, credentialId: result.credentialId });
  } catch {
    return NextResponse.json({ error: "No se pudo verificar la passkey." }, { status: 500 });
  }
}
