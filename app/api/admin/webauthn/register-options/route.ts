import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";
import { adminRegistrationOptions } from "@/lib/webauthn";

export const runtime = "nodejs";

/** Opciones de registro de passkey del administrador (con sesión). */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const options = await adminRegistrationOptions({ email: session.email });
    return NextResponse.json(options);
  } catch {
    return NextResponse.json({ error: "No se pudieron generar las opciones." }, { status: 500 });
  }
}
