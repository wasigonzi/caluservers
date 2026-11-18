import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission } from "@/lib/auth";
import { CommerceError } from "@/lib/commerce";
import { createDomainOrder, getRegistrar, publicDomain, retryDomainRegistration } from "@/lib/domains";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function registrarMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "el registrador no respondió";
  const clean = raw.replace(/\s+/g, " ").trim().slice(0, 200);
  return clean || "El registrador no respondió.";
}

const ACTIONS = ["retry", "renew", "refresh"] as const;

/**
 * Acciones de administración sobre un dominio: reintentar el registro
 * fallido, renovar a mano o refrescar el estado desde el registrador.
 * Acepta JSON y datos de formulario (desde /admin/dominios): en ese caso
 * redirige de vuelta a la tabla con un aviso.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!trustedWrite(req)) return json({ ok: false, error: "Forbidden" }, 403);
  let email = "admin";
  try {
    const session = await requirePermission("domains:write");
    email = session.email;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return json({ ok: false, error: "No tienes permiso para gestionar dominios." }, 403);
    }
    return json({ ok: false, error: "Debes entrar como administrador." }, 401);
  }
  const { id } = await params;
  const domain = await db.registeredDomain.findUnique({ where: { id } }).catch(() => null);
  if (!domain) return json({ ok: false, error: "Dominio no encontrado." }, 404);

  const isForm = (req.headers.get("content-type") ?? "").includes(
    "application/x-www-form-urlencoded",
  );
  const fail = (message: string, status: number) => {
    if (isForm) {
      return NextResponse.redirect(
        new URL(`/admin/dominios?error=${encodeURIComponent(message)}`, req.url),
      );
    }
    return json({ ok: false, error: message }, status);
  };
  const done = (message: string, extra: Record<string, unknown> = {}) => {
    if (isForm) {
      return NextResponse.redirect(
        new URL(`/admin/dominios?msg=${encodeURIComponent(message)}`, req.url),
      );
    }
    return json({ ok: true, message, ...extra });
  };
  let body: Record<string, unknown> = {};
  try {
    if (isForm) {
      const form = await req.formData();
      body = Object.fromEntries(form.entries());
    } else {
      body = await req.json();
    }
  } catch {
    return fail("No se pudo leer la acción.", 400);
  }
  const action = typeof body?.action === "string" ? body.action : "";
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return fail("La acción no es válida.", 400);
  }

  try {
    if (action === "retry") {
      const result = await retryDomainRegistration(domain.id, email);
      const fresh =
        (await db.registeredDomain
          .findUnique({ where: { id: domain.id } })
          .catch(() => null)) ?? domain;
      return done("Reintento de registro ejecutado.", {
        domain: publicDomain(fresh),
        result: result ?? null,
      });
    }
    if (action === "renew") {
      const created = await createDomainOrder({
        userId: domain.userId,
        domain: domain.domain,
        kind: "renewal",
        idempotencyKey: randomUUID(),
      });
      const invoice = created.invoice;
      return done("Pedido de renovación creado.", {
        order: { id: created.id, totalCents: created.totalCents, currency: created.currency, status: created.status },
        invoice: { id: invoice.id, number: invoice.number, totalCents: invoice.totalCents, currency: invoice.currency, status: invoice.status },
      });
    }
    // refresh
    let remote;
    try {
      const registrar = getRegistrar(domain.registrarKey ?? "porkbun");
      remote = await registrar.getDomain(domain.domain);
    } catch (error) {
      return fail(`No se pudo consultar el registrador: ${registrarMessage(error)}`, 502);
    }
    const updated = await db.registeredDomain.update({
      where: { id: domain.id },
      data: {
        ...(remote.expiresAt ? { expiresAt: remote.expiresAt } : {}),
        ...(remote.status ? { status: remote.status } : {}),
        ...(remote.nameservers?.length ? { nameservers: remote.nameservers } : {}),
      },
    });
    return done("Estado actualizado desde el registrador.", { domain: publicDomain(updated) });
  } catch (error) {
    if (error instanceof CommerceError) return fail(error.message, error.status);
    return fail("No se pudo completar la acción.", 503);
  }
}
