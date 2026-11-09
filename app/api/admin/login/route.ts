import { NextRequest, NextResponse } from "next/server";
import { evaluateAdminLogin } from "@/lib/admin-login";
import { accessGapNames, adminLoginMessage, isLoginCode } from "@/lib/admin-login-messages";
import { createSession, sessionCookie } from "@/lib/auth";
import { clientRateKey } from "@/lib/login-rate-limit";
import { clearLoginThrottle, consumeLoginAttempt } from "@/lib/login-throttle-store";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";

function bodyOf(decision: { code: string; missing?: string[]; retryAfterSec?: number }) {
  const code = isLoginCode(decision.code) ? decision.code : "unexpected";
  return {
    code,
    missing: decision.missing ?? [],
    error: adminLoginMessage(code, accessGapNames(decision.missing)),
  };
}

export async function POST(req: NextRequest) {
  const trusted = trustedWrite(req);
  let email = "";
  let password = "";
  let code = "";
  if (trusted) {
    try {
      const body = await req.json();
      email = typeof body?.email === "string" ? body.email : "";
      password = typeof body?.password === "string" ? body.password : "";
      code = typeof body?.code === "string" ? body.code : "";
    } catch {
      return NextResponse.json(bodyOf({ code: "unexpected" }), { status: 500 });
    }
  }
  const key = clientRateKey(req.headers);
  let decision;
  try {
    decision = await evaluateAdminLogin(
      { trusted, email, password, code },
      {
        consume: () => consumeLoginAttempt(key),
        clear: () => clearLoginThrottle(key),
      },
    );
  } catch {
    return NextResponse.json(bodyOf({ code: "unexpected" }), { status: 500 });
  }
  if (decision.code !== "ok") {
    const headers = decision.retryAfterSec ? { "Retry-After": String(decision.retryAfterSec) } : undefined;
    return NextResponse.json(bodyOf(decision), { status: decision.status, headers });
  }
  try {
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
    return NextResponse.json(bodyOf({ code: "unexpected" }), { status: 500 });
  }
}
