import { NextRequest, NextResponse } from "next/server";
import {
  ContactError,
  parseContactInput,
  submitContactMessage,
} from "@/lib/contact-intake";
import { clientRateKey } from "@/lib/login-rate-limit";
import { trustedWrite } from "@/lib/request";
import { consumeRequest } from "@/lib/request-throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const BODY_LIMIT = 16 * 1024;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

async function readBody(req: NextRequest): Promise<unknown> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    throw new ContactError("Formulario no válido.", 400);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new ContactError("Formulario no válido.", 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        throw new ContactError("El mensaje es demasiado largo.", 413);
      }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch (error) {
    throw error instanceof ContactError ? error : new ContactError("Formulario no válido.", 400);
  }
}

export async function POST(req: NextRequest) {
  // Mismo origen HTTPS: un formulario ajeno no publica en este buzón.
  if (!trustedWrite(req)) return json({ ok: false, error: "Origen no permitido." }, 403);

  const key = clientRateKey(req.headers);
  let allowed: Awaited<ReturnType<typeof consumeRequest>>;
  try {
    allowed = await consumeRequest("contact", key);
  } catch {
    // Sin contador compartido no se acepta el mensaje: no hay modo sin límite.
    return json(
      { ok: false, error: "El formulario no está disponible ahora. Escribe por correo." },
      503,
    );
  }
  if (!allowed.allowed) {
    return json(
      { ok: false, error: "Demasiados mensajes desde tu conexión. Inténtalo más tarde." },
      429,
      { "Retry-After": String(allowed.retryAfterSec) },
    );
  }

  try {
    const input = parseContactInput(await readBody(req));
    const result = await submitContactMessage(input, key);
    return json({
      ok: true,
      id: result.id,
      delivered: result.delivered,
      message: result.delivered
        ? "Mensaje recibido. Te respondemos al correo que indicaste."
        : "Mensaje recibido y guardado. El aviso por correo no salió, pero lo vemos en el panel.",
    });
  } catch (error) {
    if (error instanceof ContactError) {
      return json({ ok: false, error: error.message }, error.status);
    }
    // Un fallo de base no se presenta como éxito.
    return json(
      { ok: false, error: "No se pudo guardar el mensaje. Vuelve a intentarlo o escríbenos por correo." },
      503,
    );
  }
}
