import { NextRequest, NextResponse } from "next/server";
import { checkPassword, createSession, sessionCookie } from "@/lib/auth";
import {
  clearLoginFailures,
  clientRateKey,
  loginAttemptAllowed,
  recordLoginFailure,
} from "@/lib/login-rate-limit";
import { trustedWrite } from "@/lib/request";
import { totpConfig, verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const key = clientRateKey(req.headers);
  const decision = loginAttemptAllowed(key);
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
      recordLoginFailure(key);
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
      recordLoginFailure(key);
      return NextResponse.json(
        { error: "Unauthorized", mfaRequired: true },
        { status: 401 },
      );
    }
    clearLoginFailures(key);
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
