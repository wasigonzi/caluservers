import { NextRequest, NextResponse } from "next/server";
import { DomainQueryError, lookupDomain, supportedTlds } from "@/lib/domain-lookup";
import { clientRateKey } from "@/lib/login-rate-limit";
import { consumeRequest } from "@/lib/request-throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** Consulta de disponibilidad. Solo lectura, sin credenciales y limitada por IP. */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") || "";
  const tld = req.nextUrl.searchParams.get("tld") || undefined;
  if (!name.trim()) {
    return json({ ok: false, error: "Escribe un dominio.", tlds: supportedTlds() }, 400);
  }

  let allowed: Awaited<ReturnType<typeof consumeRequest>>;
  try {
    allowed = await consumeRequest("domain-lookup", clientRateKey(req.headers));
  } catch {
    // Sin contador compartido no se consulta un servidor ajeno.
    return json({ ok: false, error: "La consulta no está disponible ahora." }, 503);
  }
  if (!allowed.allowed) {
    return json(
      { ok: false, error: "Demasiadas consultas. Espera un momento." },
      429,
      { "Retry-After": String(allowed.retryAfterSec) },
    );
  }

  try {
    const result = await lookupDomain(name, tld);
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof DomainQueryError) {
      return json({ ok: false, error: error.message, tlds: supportedTlds() }, error.status);
    }
    return json({ ok: false, error: "No se pudo comprobar el dominio." }, 503);
  }
}
