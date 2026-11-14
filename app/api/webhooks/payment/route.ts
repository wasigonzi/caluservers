import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { confirmPayment, verifyWebhookSignature } from "@/lib/provisioning";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/webhooks/payment — confirmación de pago de un proveedor.
 *  Contrato (documentado en docs/orders-provisioning.md):
 *  - Header `x-caluservers-signature: sha256=<hmac hex del cuerpo crudo
 *    con PAYMENT_WEBHOOK_SECRET>`.
 *  - Cuerpo JSON: { orderNumber, paymentRef?, status: "paid" | "completed" }.
 *  Idempotente: un pago ya confirmado responde 200 sin re-aprovisionar.
 *  Si el aprovisionamiento falla, el pedido queda en provision_failed con
 *  el error visible en el panel (se responde 200 para no reintentar en bucle;
 *  el admin reintenta desde la web). */
export async function POST(req: NextRequest) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || "";
  if (!secret)
    return NextResponse.json(
      { error: "Webhook de pago no configurado." },
      { status: 503 },
    );
  const raw = await req.text();
  const signature = req.headers.get("x-caluservers-signature");
  if (!verifyWebhookSignature(raw, signature, secret))
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const data = (payload ?? {}) as Record<string, unknown>;
  const orderNumber =
    typeof data.orderNumber === "string" ? data.orderNumber.trim() : "";
  const paymentRef =
    typeof data.paymentRef === "string"
      ? data.paymentRef.slice(0, 120)
      : null;
  const status = typeof data.status === "string" ? data.status : "";
  if (!orderNumber || !["paid", "completed"].includes(status))
    return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  const order = await db.order.findUnique({ where: { number: orderNumber } });
  if (!order)
    return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
  try {
    const result = await confirmPayment(order.id, {
      paymentRef,
      paidVia: "webhook",
    });
    return NextResponse.json({
      ok: true,
      number: order.number,
      status: result.order.status,
      provisioned: result.provisioned,
      alreadyConfirmed: result.alreadyConfirmed,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo confirmar el pago." },
      { status: 502 },
    );
  }
}
