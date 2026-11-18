import { NextRequest, NextResponse } from "next/server";
import { clientRateKey } from "@/lib/login-rate-limit";
import { consumeLoginAttempt } from "@/lib/login-throttle-store";
import { trustedWrite } from "@/lib/request";
import { adminAuthenticationOptions } from "@/lib/webauthn";

export const runtime = "nodejs";

/**
 * Opciones de autenticación con passkey (sin sesión: es el login).
 * El intento también consume del límite de login: sin passkey no hay
 * forma de verificar nada, pero no se regalan intentos ilimitados.
 */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const key = clientRateKey(req.headers);
  try {
    const decision = await consumeLoginAttempt(key);
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos." },
        { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "No se pudo comprobar el límite de acceso. El ingreso queda cerrado." },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo no válido." }, { status: 400 });
  }
  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email : "";
  if (!email) return NextResponse.json({ error: "Falta el correo." }, { status: 400 });
  try {
    const options = await adminAuthenticationOptions(email);
    if (!options) {
      return NextResponse.json(
        { error: "Esa cuenta no tiene passkeys enroladas." },
        { status: 404 },
      );
    }
    return NextResponse.json(options);
  } catch {
    return NextResponse.json({ error: "No se pudieron generar las opciones." }, { status: 500 });
  }
}
