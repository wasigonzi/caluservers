import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CommerceError } from "@/lib/commerce";
import { createDomainOrder, getRegistrar, parseNameservers, publicDomain } from "@/lib/domains";
import { customerSession } from "@/lib/customer-session";
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

/** Mensaje saneado de un fallo del registrador: sin secretos ni trazas. */
function registrarMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "el registrador no respondió";
  const clean = raw.replace(/\s+/g, " ").trim().slice(0, 200);
  return clean || "El registrador no respondió.";
}

const ACTIONS = ["autorenew", "nameservers", "renew", "transfer", "authcode", "refresh"] as const;
type Action = (typeof ACTIONS)[number];

/** Detalle de un dominio propio: uno ajeno es un 404, como en facturas. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await customerSession();
  if (!session?.user) {
    return json({ ok: false, error: "Debes entrar para ver tus dominios." }, 401);
  }
  const { id } = await params;
  const domain = await db.registeredDomain
    .findFirst({ where: { id, userId: session.user.id } })
    .catch(() => null);
  if (!domain) return json({ ok: false, error: "Dominio no encontrado." }, 404);
  return json({ ok: true, domain: publicDomain(domain) });
}

/**
 * Acciones sobre un dominio propio. `authcode` es un 501 honesto: el
 * código EPP se obtiene en el panel de Porkbun, no lo guarda CaluServers.
 * `autorenew` solo cambia el flag local: Porkbun no expone endpoint
 * verificado para el auto-renew. Acepta JSON y datos de formulario (desde
 * /cuenta/dominios): en ese caso redirige de vuelta a la lista con un aviso.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!trustedWrite(req)) return json({ ok: false, error: "Forbidden" }, 403);
  const session = await customerSession();
  if (!session?.user) {
    return json({ ok: false, error: "Debes entrar para gestionar tus dominios." }, 401);
  }
  const { id } = await params;
  const domain = await db.registeredDomain
    .findFirst({ where: { id, userId: session.user.id } })
    .catch(() => null);
  if (!domain) return json({ ok: false, error: "Dominio no encontrado." }, 404);

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
  const done = (message: string, extra: Record<string, unknown> = {}) => {
    if (isForm) {
      return NextResponse.redirect(
        new URL(`/cuenta/dominios?msg=${encodeURIComponent(message)}`, req.url),
      );
    }
    return json({ ok: true, message, ...extra });
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
    return fail("No se pudo leer la acción.", 400);
  }
  const action = typeof body?.action === "string" ? body.action : "";
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return fail("La acción no es válida.", 400);
  }

  try {
    switch (action as Action) {
      case "autorenew": {
        if (
          body?.autoRenew !== true &&
          body?.autoRenew !== false &&
          body?.autoRenew !== "true" &&
          body?.autoRenew !== "false"
        ) {
          return fail("Indica si la renovación automática va activada o no.", 400);
        }
        const autoRenew = body?.autoRenew === true || body?.autoRenew === "true";
        try {
          // No-op documentado en Porkbun: el flag vive solo en local.
          const registrar = getRegistrar(domain.registrarKey ?? "porkbun");
          await registrar.setAutoRenew(domain.domain, autoRenew);
        } catch (error) {
          return fail(`No se pudo cambiar la renovación automática: ${registrarMessage(error)}`, 502);
        }
        const updated = await db.registeredDomain.update({
          where: { id: domain.id },
          data: { autoRenew },
        });
        return done(
          autoRenew ? "Renovación automática activada." : "Renovación automática desactivada.",
          { domain: publicDomain(updated) },
        );
      }
      case "nameservers": {
        let names: string[];
        try {
          names = parseNameservers(body?.nameservers);
        } catch (error) {
          if (error instanceof CommerceError) return fail(error.message, error.status);
          throw error;
        }
        try {
          const registrar = getRegistrar(domain.registrarKey ?? "porkbun");
          await registrar.setNameservers(domain.domain, names);
        } catch (error) {
          return fail(`No se pudieron cambiar los servidores de nombres: ${registrarMessage(error)}`, 502);
        }
        const updated = await db.registeredDomain.update({
          where: { id: domain.id },
          data: { nameservers: names },
        });
        return done("Servidores de nombres actualizados.", { domain: publicDomain(updated) });
      }
      case "renew": {
        const created = await createDomainOrder({
          userId: session.user.id,
          domain: domain.domain,
          kind: "renewal",
          idempotencyKey: randomUUID(),
        });
        const invoice = created.invoice;
        if (isForm) {
          return NextResponse.redirect(new URL(`/cuenta/facturas/${invoice.id}`, req.url));
        }
        return json({
          ok: true,
          message: "Pedido de renovación creado.",
          order: { id: created.id, totalCents: created.totalCents, currency: created.currency, status: created.status },
          invoice: { id: invoice.id, number: invoice.number, totalCents: invoice.totalCents, currency: invoice.currency, status: invoice.status },
        });
      }
      case "transfer": {
        const authCode = typeof body?.authCode === "string" ? body.authCode.trim() : "";
        if (!authCode) return fail("El código de autorización es obligatorio para transferir.", 400);
        if (authCode.length > 128) return fail("El código de autorización es demasiado largo.", 400);
        const created = await createDomainOrder({
          userId: session.user.id,
          domain: domain.domain,
          kind: "transfer",
          authCode,
          idempotencyKey: randomUUID(),
        });
        const invoice = created.invoice;
        if (isForm) {
          return NextResponse.redirect(new URL(`/cuenta/facturas/${invoice.id}`, req.url));
        }
        return json({
          ok: true,
          message: "Pedido de transferencia creado.",
          order: { id: created.id, totalCents: created.totalCents, currency: created.currency, status: created.status },
          invoice: { id: invoice.id, number: invoice.number, totalCents: invoice.totalCents, currency: invoice.currency, status: invoice.status },
        });
      }
      case "authcode": {
        // 501 honesto: CaluServers no guarda el código EPP; lo tiene Porkbun.
        return fail(
          "El código EPP se obtiene en el panel de Porkbun, no en CaluServers.",
          501,
        );
      }
      case "refresh": {
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
      }
    }
  } catch (error) {
    if (error instanceof CommerceError) return fail(error.message, error.status);
    return fail("No se pudo completar la acción.", 503);
  }
}
