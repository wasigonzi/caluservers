import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { confirmPayment } from "@/lib/provisioning";
import { whmGuard, whmJson } from "@/lib/whm-http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/admin/orders/[id]/confirm-payment — el admin confirma el pago
 *  (ej. transferencia o pago manual) y el pedido se aprovisiona
 *  automáticamente. Idempotente: confirmar dos veces no duplica la cuenta. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await whmGuard(req, true);
  if (denied) return denied;
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const paymentRef =
    typeof (body as Record<string, unknown>)?.paymentRef === "string"
      ? ((body as Record<string, unknown>).paymentRef as string).slice(0, 120)
      : null;
  const existing = await db.order.findUnique({ where: { id } });
  if (!existing) return whmJson({ error: "Pedido no encontrado." }, 404);
  try {
    const result = await confirmPayment(id, {
      paymentRef,
      paidVia: "admin",
    });
    return whmJson({
      ok: true,
      number: result.order.number,
      status: result.order.status,
      provisioned: result.provisioned,
      alreadyConfirmed: result.alreadyConfirmed,
      provisionError: result.provisionError ?? null,
      whmUsername: result.order.whmUsername,
    });
  } catch (error) {
    return whmJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo confirmar el pago.",
      },
      400,
    );
  }
}
