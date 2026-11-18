import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requireAdmin, requirePermission } from "@/lib/auth";
import { STEP_UP_ERROR_CODE, STEP_UP_MESSAGE, StepUpRequiredError, requireStepUp } from "@/lib/stepup";
import {
  CommerceError,
  confirmManualPayment,
  markPaymentRefunded,
  replyTicket,
  setServicePanel,
  setServiceStatus,
  setTicketStatus,
  voidInvoice,
} from "@/lib/commerce";
import { notifyCustomerOfReply } from "@/lib/ticket-notify";
import { raiseAlert } from "@/lib/alerts";
import { db } from "@/lib/db";
import {
  suspendServicePanel,
  terminateServicePanel,
  unsuspendServicePanel,
} from "@/lib/panels";
import { trustedWrite } from "@/lib/request";
import { WhmError, safeWhmError } from "@/lib/whm-security";
import { maybeAutoProvision, ProvisionError, provisionService } from "@/lib/whm-provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

const MESSAGE_STATES = ["new", "read", "archived"] as const;

/**
 * Acciones que además del permiso exigen step-up reciente (Fase 6,
 * frente C): terminar un servicio es irreversible y reembolsar mueve
 * dinero. Sin `stepUpAt` reciente la ruta responde 403 con el código
 * `step-up-required` y la UI pide la contraseña de nuevo.
 */
const STEP_UP_ACTIONS = new Set(["service-terminate", "refund-payment"]);

/**
 * Permiso que exige cada acción (Fase 1, tramo D — RBAC). La acción se
 * declara al inicio, antes de tocar la base o WHM; sin el permiso la ruta
 * responde 403 y requirePermission deja el evento `authz.denied`.
 */
const ACTION_PERMISSIONS: Record<string, string> = {
  "confirm-payment": "payments:confirm",
  "refund-payment": "payments:confirm",
  "service-status": "services:suspend",
  "service-suspend": "services:suspend",
  "service-unsuspend": "services:suspend",
  "service-terminate": "services:terminate",
  "service-panel": "services:provision",
  "void-invoice": "payments:confirm",
  "ticket-status": "tickets:reply",
  "provision-service": "services:provision",
  "reply-ticket": "tickets:reply",
  // Cambiar el estado de un mensaje de contacto es solo lectura de
  // tickets: no escribe en tickets ni en cobros.
  "message-status": "tickets:view",
};

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  let email = "admin";
  try {
    const permission = ACTION_PERMISSIONS[action];
    if (permission) {
      const session = await requirePermission(permission);
      email = session.email;
      // Paso extra solo para las acciones peligrosas: sin step-up reciente
      // no se toca la base ni el panel.
      if (STEP_UP_ACTIONS.has(action)) requireStepUp(session);
    } else {
      // Acción no reconocida: se exige sesión para no filtrar nada y se
      // responde 400 sin tocar la base.
      await requireAdmin();
    }
  } catch (error) {
    if (error instanceof StepUpRequiredError) {
      return NextResponse.json(
        { error: STEP_UP_ERROR_CODE, message: STEP_UP_MESSAGE },
        { status: 403 },
      );
    }
    // Cualquier error que no sea de permiso es falta de sesión: la
    // comprobación no usa el mensaje (los mocks de las pruebas viven en
    // otro reino y `instanceof Error` no los reconoce).
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sin permiso para esta acción." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await runAction(email, body, action);
  } catch {
    return NextResponse.json({ error: "No se pudo completar la operación." }, { status: 503 });
  }
}

async function runAction(email: string, body: any, action: string) {
  try {
    if (action === "confirm-payment") {
      const payment = await confirmManualPayment({
        actor: email,
        invoiceId: String(body.invoiceId || ""),
        note: String(body.note || ""),
        provider: body.provider === "bank_transfer" ? "bank_transfer" : undefined,
      });
      // Acción administrativa crítica (Fase 6): confirmar un pago a mano
      // deja una alerta de severidad warning. Nunca tumba la respuesta.
      await raiseAlert({
        ruleKey: "admin.critical_action",
        severity: "warning",
        title: `Pago manual confirmado: ${payment.invoiceId}`,
        body: `El administrador ${email} confirmó a mano el pago de la factura ${payment.invoiceId} por ${(payment.amountCents / 100).toFixed(2)} ${payment.currency}.`,
        resourceType: "invoice",
        resourceId: payment.invoiceId,
      }).catch(() => {});
      // Si el alta automática está activa, se intenta; un fallo no deshace el cobro.
      const provision = await maybeAutoProvision({
        invoiceId: payment.invoiceId,
        actor: email,
      });
      return NextResponse.json({
        id: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
        currency: payment.currency,
        provisioned: provision.provisioned,
        provisionNote: provision.reason,
      });
    }
    if (action === "refund-payment") {
      const paymentId = String(body.paymentId || "");
      const note = String(body.note || "");
      if (note.trim().length < 8) {
        return NextResponse.json(
          { error: "La nota del reembolso debe explicar el motivo." },
          { status: 400 },
        );
      }
      const payment = await db.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        return NextResponse.json({ error: "Cobro no encontrado." }, { status: 404 });
      }
      if (payment.status === "refunded") {
        return NextResponse.json({ error: "Ese cobro ya está reembolsado." }, { status: 409 });
      }
      if (payment.status !== "confirmed") {
        return NextResponse.json(
          { error: "Solo se reembolsa un cobro confirmado." },
          { status: 409 },
        );
      }
      const rawAmount = body.amountCents;
      const amountCents =
        rawAmount === undefined || rawAmount === null || rawAmount === ""
          ? undefined
          : Number(rawAmount);
      if (
        amountCents !== undefined &&
        (!Number.isSafeInteger(amountCents) ||
          amountCents <= 0 ||
          amountCents > payment.amountCents)
      ) {
        return NextResponse.json({ error: "Importe a reembolsar no válido." }, { status: 400 });
      }
      if (payment.provider === "paypal") {
        // PayPal no tiene reembolso implementado en este código: no se inventa
        // la llamada. El admin lo hace en PayPal y lo deja constancia aquí.
        return NextResponse.json(
          {
            error:
              "El reembolso en PayPal no está implementado: hazlo en PayPal y registra el cambio con una nota.",
          },
          { status: 501 },
        );
      }
      if (payment.provider === "stripe") {
        // Importación diferida: el SDK de Stripe no carga en las demás
        // acciones de esta ruta.
        const { refundPayment, StripeError } = await import("@/lib/stripe");
        try {
          const result = await refundPayment(
            {
              id: payment.id,
              providerRef: payment.providerRef,
              amountCents: payment.amountCents,
              currency: payment.currency,
            },
            amountCents,
            { actor: email, note },
          );
          // Acción administrativa crítica (Fase 6): reembolso, critical.
          await raiseAlert({
            ruleKey: "admin.critical_action",
            severity: "critical",
            title: `Reembolso registrado: ${payment.id}`,
            body: `El administrador ${email} reembolsó el cobro ${payment.id} en Stripe por ${(payment.amountCents / 100).toFixed(2)} ${payment.currency}.`,
            resourceType: "payment",
            resourceId: payment.id,
          }).catch(() => {});
          return NextResponse.json({
            id: result.payment.id,
            status: result.payment.status,
            refundId: result.refundId,
          });
        } catch (error) {
          if (error instanceof StripeError) {
            return NextResponse.json(
              { error: error.message },
              { status: error.code === "unconfigured" ? 503 : 502 },
            );
          }
          throw error;
        }
      }
      // manual / bank_transfer: no hay pasarela que reembolsar; solo queda
      // constancia en BD con la nota. Nunca automático.
      const updated = await markPaymentRefunded({
        actor: email,
        paymentId: payment.id,
        note,
      });
      await raiseAlert({
        ruleKey: "admin.critical_action",
        severity: "critical",
        title: `Reembolso registrado: ${payment.id}`,
        body: `El administrador ${email} marcó como reembolsado el cobro ${payment.id} por ${(payment.amountCents / 100).toFixed(2)} ${payment.currency} (sin pasarela: el reembolso real lo hace el admin a mano).`,
        resourceType: "payment",
        resourceId: payment.id,
      }).catch(() => {});
      return NextResponse.json({ id: updated.id, status: updated.status });
    }
    if (action === "service-status") {
      const service = await setServiceStatus({
        actor: email,
        serviceId: String(body.serviceId || ""),
        status: body.status === "cancelled" ? "cancelled" : "active",
        note: String(body.note || ""),
      });
      // Al cancelar, si el servicio tiene cuenta en su panel, se intenta
      // suspenderla FUERA de la transacción del cambio de estado (una
      // llamada de red no va dentro), igual que el alta automática tras el
      // cobro. La cancelación en BD ya está hecha y no se deshace aunque la
      // suspensión falle: el intento y su motivo quedan visibles al admin en
      // `provisionError` y en el diario (ver `suspendServicePanel`, que
      // resuelve el panel del servicio). Al cancelar, la suscripción del
      // servicio queda también como cancelled (en `setServiceStatus`) para
      // que el cron no genere más facturas de renovación.
      let suspension = null;
      if (service.status === "cancelled" && (service.panelAccountId || service.cpanelUser)) {
        suspension = await suspendServicePanel({
          serviceId: service.id,
          actor: email,
        }).catch(() => ({
          attempted: false,
          suspended: false,
          reason:
            "No se pudo intentar la suspensión en el panel. La cuenta sigue activa: suspéndela a mano en el panel.",
        }));
      }
      return NextResponse.json({
        id: service.id,
        status: service.status,
        // Solo al cancelar un servicio con cuenta en su panel: si la
        // suspensión no se intentó o falló, la cuenta sigue activa y el
        // motivo queda también en `provisionError` y en el diario del servicio.
        suspended: suspension?.suspended ?? null,
        suspendNote: suspension?.reason ?? null,
      });
    }
    if (action === "service-suspend") {
      // Suspender solo en el panel, sin cancelar el servicio en base.
      const note = String(body.note || "");
      if (note.trim().length < 8) {
        return NextResponse.json(
          { error: "Indica por qué se suspende la cuenta del servicio." },
          { status: 400 },
        );
      }
      const service = await db.customerService.findUnique({
        where: { id: String(body.serviceId || "") },
      });
      if (!service) {
        return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });
      }
      const result = await suspendServicePanel({ serviceId: service.id, actor: email });
      return NextResponse.json({
        id: service.id,
        suspended: result.suspended,
        suspendNote: result.reason,
      });
    }
    if (action === "service-unsuspend") {
      // Reactivar solo en el panel, sin cambiar el estado del servicio.
      const note = String(body.note || "");
      if (note.trim().length < 8) {
        return NextResponse.json(
          { error: "Indica por qué se reactiva la cuenta del servicio." },
          { status: 400 },
        );
      }
      const service = await db.customerService.findUnique({
        where: { id: String(body.serviceId || "") },
      });
      if (!service) {
        return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });
      }
      const result = await unsuspendServicePanel({ serviceId: service.id, actor: email });
      return NextResponse.json({
        id: service.id,
        unsuspended: result.unsuspended,
        unsuspendNote: result.reason,
      });
    }
    if (action === "service-terminate") {
      // Terminar la cuenta en el panel es irreversible: exige confirmación
      // explícita del admin (`confirm: true`) y nota de al menos 8
      // caracteres. No cambia el estado del servicio en base: la
      // cancelación es `service-status`. Si el panel falla, la terminación
      // no se simula: el motivo queda en `provisionError` y en el diario.
      const confirmed = body.confirm === true || body.confirm === "true";
      const note = String(body.note || "");
      if (!confirmed) {
        return NextResponse.json(
          { error: "La terminación exige confirmación explícita." },
          { status: 400 },
        );
      }
      if (note.trim().length < 8) {
        return NextResponse.json(
          { error: "Indica por qué se termina la cuenta del servicio." },
          { status: 400 },
        );
      }
      const service = await db.customerService.findUnique({
        where: { id: String(body.serviceId || "") },
      });
      if (!service) {
        return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });
      }
      const result = await terminateServicePanel({ serviceId: service.id, actor: email });
      // Acción administrativa crítica (Fase 6): terminar un servicio es
      // irreversible, así que solo se alerta cuando el panel la aceptó.
      if (result.terminated) {
        await raiseAlert({
          ruleKey: "admin.critical_action",
          severity: "critical",
          title: `Servicio terminado en el panel: ${service.id}`,
          body: `El administrador ${email} terminó la cuenta del servicio ${service.id} en su panel. Esta acción es irreversible.`,
          resourceType: "service",
          resourceId: service.id,
        }).catch(() => {});
      }
      return NextResponse.json({
        id: service.id,
        terminated: result.terminated,
        terminateNote: result.reason,
      });
    }
    if (action === "service-panel") {
      const service = await setServicePanel({
        actor: email,
        serviceId: String(body.serviceId || ""),
        panelKey: String(body.panelKey || ""),
        note: String(body.note || ""),
      });
      return NextResponse.json({ id: service.id, panelKey: service.panelKey });
    }
    if (action === "void-invoice") {
      const invoice = await voidInvoice({
        actor: email,
        invoiceId: String(body.invoiceId || ""),
        note: String(body.note || ""),
      });
      return NextResponse.json({ id: invoice.id, status: invoice.status });
    }
    if (action === "ticket-status") {
      const ticket = await setTicketStatus({
        actor: email,
        ticketId: String(body.ticketId || ""),
        status: body.status === "closed" ? "closed" : "open",
      });
      return NextResponse.json({ id: ticket.id, status: ticket.status });
    }
    if (action === "provision-service") {
      const result = await provisionService({
        actor: email,
        serviceId: String(body.serviceId || ""),
      });
      return NextResponse.json(result);
    }
    if (action === "reply-ticket") {
      const message = await replyTicket({
        ticketId: String(body.ticketId || ""),
        author: "admin",
        body: String(body.body || ""),
      });
      // El aviso al cliente es un extra: si no sale, la respuesta ya está guardada.
      const notified = await notifyCustomerOfReply(String(body.ticketId || ""));
      return NextResponse.json({ id: message.id, notified });
    }
    if (action === "message-status") {
      const status = String(body.status || "");
      const id = String(body.messageId || "");
      if (!(MESSAGE_STATES as readonly string[]).includes(status) || !id) {
        return NextResponse.json({ error: "Estado no válido." }, { status: 400 });
      }
      const found = await db.contactMessage.findUnique({ where: { id }, select: { id: true } });
      if (!found) return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });
      const updated = await db.contactMessage.update({
        where: { id },
        data: { status },
        select: { id: true, status: true },
      });
      return NextResponse.json(updated);
    }
    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (error) {
    if (error instanceof CommerceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ProvisionError) {
      // Falta configuración o el servicio no está en el estado correcto.
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "notfound" ? 404 : 409 },
      );
    }
    if (error instanceof WhmError) {
      const safe = safeWhmError(error);
      return NextResponse.json({ error: safe.message, code: safe.code }, { status: 502 });
    }
    throw error;
  }
}
