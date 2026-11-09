import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";
import { customerAuth, customerAuthReady } from "@/lib/customer-auth";
import { clientRateKey } from "@/lib/login-rate-limit";
import { consumeLoginAttempt } from "@/lib/login-throttle-store";

const handler = toNextJsHandler(customerAuth);
const LIMITED = ["/sign-in", "/sign-up", "/request-password-reset", "/forget-password", "/send-verification-email"];

async function guarded(req: NextRequest) {
  if (!customerAuthReady) {
    return NextResponse.json(
      { error: "El área de clientes no está configurada." },
      { status: 503 },
    );
  }
  if (req.method === "POST" && LIMITED.some((part) => req.nextUrl.pathname.includes(part))) {
    try {
      const decision = await consumeLoginAttempt(`customer:${clientRateKey(req.headers)}:${req.nextUrl.pathname}`);
      if (!decision.allowed) {
        return NextResponse.json(
          { error: "Demasiados intentos. Espera unos minutos." },
          { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "No se pudo comprobar el límite de acceso." },
        { status: 503 },
      );
    }
  }
  return req.method === "GET" ? handler.GET(req) : handler.POST(req);
}

export function GET(req: NextRequest) {
  return guarded(req);
}
export function POST(req: NextRequest) {
  return guarded(req);
}
