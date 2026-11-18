import { NextRequest, NextResponse } from "next/server";
import { createSession, sessionCookie } from "@/lib/auth";
import { clientRateKey } from "@/lib/login-rate-limit";
import { clearLoginThrottle, consumeLoginAttempt } from "@/lib/login-throttle-store";
import { trustedWrite } from "@/lib/request";
import { verifyAdminAuthentication } from "@/lib/webauthn";

export const runtime = "nodejs";

/**
 * Login con passkey: verifica la aserción, actualiza el contador y crea
 * una AdminSession. La passkey ES el factor MFA: no pide contraseña.
 * El reto es de un solo uso (ver lib/webauthn.ts): reutilizarlo se rechaza.
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
  const response = (body as { response?: unknown })?.response;
  if (!email || !response || typeof response !== "object") {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }
  try {
    const result = await verifyAdminAuthentication(
      email,
      response as Parameters<typeof verifyAdminAuthentication>[1],
    );
    if (!result.verified) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await clearLoginThrottle(key);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(
      sessionCookie,
      await createSession(email, {
        ip: key,
        userAgent: req.headers.get("user-agent") ?? undefined,
      }),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 28800,
      },
    );
    return res;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
