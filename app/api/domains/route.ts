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

/**
 * Consulta de disponibilidad. Solo lectura, sin credenciales y limitada por IP.
 *
 * Sobre el 403 que vio un crawler de texto en vivo (auditoría 2026-11-15):
 * esta ruta NO devuelve 403 en ninguna rama (400 sin nombre o dominio no
 * válido, 429 si se agota el límite, 503 si la base del límite o el RDAP no
 * responden). No hay middleware ni guarda de origen/UA en el repo, y no se
 * usa trustedWrite aquí (es GET público). El 403 vino de fuera de la app:
 * el cortafuegos/bot-protection de Vercel frente a un crawler sin navegador,
 * o del propio servicio de fetch (la auditoría anotó el mismo patrón en
 * /admin/login: "403 del servicio de fetch, no del sitio"). No se quitó nada:
 * el límite y el RDAP siguen intactos. Para verificarlo, con navegador real:
 * abre /domains, busca un dominio y comprueba que la respuesta es 200 con
 * { ok:true, state:"available"|"registered"|"unverified" }; robots.txt
 * desautoriza /api/ a crawlers, así que un crawler no debe consultarla.
 */
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
