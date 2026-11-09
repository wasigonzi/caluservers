import { NextRequest, NextResponse } from "next/server";
import { checkPassword, createSession, sessionCookie } from "@/lib/auth";
import { clientRateKey } from "@/lib/login-rate-limit";
import { clearLoginThrottle, consumeLoginAttempt } from "@/lib/login-throttle-store";
import { trustedWrite } from "@/lib/request";
import { totpConfig, verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";

const LIMIT_ERROR = "No se pudo comprobar el límite de acceso. El ingreso queda cerrado.";

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const key = clientRateKey(req.headers);
  let decision: { allowed: boolean; retryAfterSec: number };
  try {
    decision = await consumeLoginAttempt(key);
  } catch {
    return NextResponse.json({ error: LIMIT_ERROR }, { status: 503 });
  }
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } },
    );
  }
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const code = typeof body?.code === "string" ? body.code : "";
    if (!checkPassword(email, password)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const mfa = totpConfig(process.env.ADMIN_TOTP_SECRET);
    if (mfa === "invalid") {
      return NextResponse.json(
        { error: "MFA está definido pero no es un secreto TOTP válido." },
        { status: 500 },
      );
    }
    if (mfa === "ready" && !verifyTotp(process.env.ADMIN_TOTP_SECRET || "", code)) {
      return NextResponse.json(
        { error: "Unauthorized", mfaRequired: true },
        { status: 401 },
      );
    }
    try {
      await clearLoginThrottle(key);
    } catch {
      return NextResponse.json({ error: LIMIT_ERROR }, { status: 503 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookie, createSession(), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 28800,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
