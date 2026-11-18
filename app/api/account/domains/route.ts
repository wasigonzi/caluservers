import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CommerceError } from "@/lib/commerce";
import { createDomainOrder } from "@/lib/domains";
import { DomainNameError, normalizeDomainName } from "@/lib/domain-name";
import { customerSession } from "@/lib/customer-session";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/** Nameservers guardados como Json: se normalizan a lista de texto. */
export function nameserverList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

/**
 * Vista pública de un dominio registrado: nunca incluye el código de
 * autorización cifrado ni ningún secreto del registrador.
 */
export function publicDomain(domain: {
  id: string;
  domain: string;
  registrarKey: string;
  status: string;
  autoRenew: boolean;
  expiresAt: Date | null;
  nameservers: unknown;
  createdAt: Date;
  updatedAt: Date;
  failureReason: string | null;
  orderId: string | null;
}) {
  return {
    id: domain.id,
    domain: domain.domain,
    registrarKey: domain.registrarKey,
    status: domain.status,
    autoRenew: domain.autoRenew,
    expiresAt: domain.expiresAt ? domain.expiresAt.toISOString() : null,
    nameservers: nameserverList(domain.nameservers),
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
    failureReason: domain.failureReason,
    orderId: domain.orderId,
  };
}

const KINDS = ["register", "renewal", "transfer"] as const;
type Kind = (typeof KINDS)[number];

/** Clave de idempotencia del cliente o una generada para este pedido. */
function idempotencyKeyOf(raw: unknown): string | undefined {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) return randomUUID();
  if (key.length > 128) throw new CommerceError("La clave de idempotencia no es válida.", 400);
  return key;
}

function parseKind(raw: unknown): Kind {
  const kind = typeof raw === "string" ? raw.trim() : "";
  if ((KINDS as readonly string[]).includes(kind)) return kind as Kind;
  throw new CommerceError("El tipo de pedido no es válido (register, renewal o transfer).", 400);
}

function parseAuthCode(raw: unknown): string {
  const code = typeof raw === "string" ? raw.trim() : "";
  if (!code) throw new CommerceError("El código de autorización es obligatorio para transferir.", 400);
  if (code.length > 128) throw new CommerceError("El código de autorización es demasiado largo.", 400);
  return code;
}

/** Mis dominios: solo los del cliente de la sesión. */
export async function GET() {
  const session = await customerSession();
  if (!session?.user) {
    return json({ ok: false, error: "Debes entrar para ver tus dominios." }, 401);
  }
  try {
    const domains = await db.registeredDomain.findMany({
      where: { userId: session.user.id },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    });
    return json({ ok: true, domains: domains.map(publicDomain) });
  } catch {
    return json({ ok: false, error: "No se pudieron cargar tus dominios." }, 503);
  }
}

/**
 * Crea un pedido de dominio (registro, renovación o transferencia) con el
 * precio congelado en el pedido. Sin precio publicado para la extensión,
 * lib/domains responde con error honesto y aquí no se inventa ninguno.
 * Renovar o transferir exige que el dominio ya esté registrado a nombre
 * del cliente: no se paga la renovación de un dominio ajeno. Acepta JSON
 * y, desde los formularios de /cuenta/dominios, datos de formulario: en
 * ese caso redirige a la factura para pagarla.
 */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return json({ ok: false, error: "Forbidden" }, 403);
  const session = await customerSession();
  if (!session?.user) {
    return json({ ok: false, error: "Debes entrar para pedir un dominio." }, 401);
  }
  const isForm = (req.headers.get("content-type") ?? "").includes(
    "application/x-www-form-urlencoded",
  );
  const fail = (message: string, status: number) => {
    if (isForm) {
      return NextResponse.redirect(
        new URL(`/cuenta/dominios?error=${encodeURIComponent(message)}`, req.url),
      );
    }
    return json({ ok: false, error: message }, status);
  };
  let body: Record<string, unknown>;
  try {
    if (isForm) {
      const form = await req.formData();
      body = Object.fromEntries(form.entries());
    } else {
      body = await req.json();
    }
  } catch {
    return fail("No se pudo leer el pedido.", 400);
  }
  let domain: string;
  let kind: Kind;
  let authCode: string | undefined;
  let key: string | undefined;
  try {
    domain = normalizeDomainName(String(body?.domain ?? ""));
    kind = parseKind(body?.kind ?? "register");
    authCode = kind === "transfer" ? parseAuthCode(body?.authCode) : undefined;
    key = idempotencyKeyOf(body?.idempotencyKey);
  } catch (error) {
    if (error instanceof DomainNameError) return fail(error.message, 400);
    if (error instanceof CommerceError) return fail(error.message, error.status);
    return fail("El pedido no es válido.", 400);
  }
  try {
    if (kind === "renewal" || kind === "transfer") {
      const owned = await db.registeredDomain.findUnique({ where: { domain } });
      if (!owned || owned.userId !== session.user.id) {
        return fail("Dominio no encontrado.", 404);
      }
    }
    // createDomainOrder devuelve {...pedido, invoice}: el pedido lleva
    // sus campos arriba y la factura colgando de `invoice`.
    const created = await createDomainOrder({
      userId: session.user.id,
      domain,
      kind,
      ...(authCode ? { authCode } : {}),
      ...(key ? { idempotencyKey: key } : {}),
    });
    const invoice = created.invoice;
    if (isForm) {
      return NextResponse.redirect(new URL(`/cuenta/facturas/${invoice.id}`, req.url));
    }
    return json({
      ok: true,
      order: {
        id: created.id,
        trackingToken: created.trackingToken,
        totalCents: created.totalCents,
        currency: created.currency,
        status: created.status,
      },
      invoice: {
        id: invoice.id,
        number: invoice.number,
        totalCents: invoice.totalCents,
        currency: invoice.currency,
        status: invoice.status,
      },
    });
  } catch (error) {
    if (error instanceof CommerceError) return fail(error.message, error.status);
    return fail("No se pudo crear el pedido de dominio.", 503);
  }
}
