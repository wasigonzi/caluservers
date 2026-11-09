import { NextRequest, NextResponse } from "next/server";
import { ingestPaypalWebhook, PaypalSandboxError } from "@/lib/paypal-checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let event: unknown = {};
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }
  try {
    const result = await ingestPaypalWebhook({
      transmissionId: req.headers.get("paypal-transmission-id") || "",
      transmissionSig: req.headers.get("paypal-transmission-sig") || "",
      transmissionTime: req.headers.get("paypal-transmission-time") || "",
      authAlgo: req.headers.get("paypal-auth-algo") || "",
      certUrl: req.headers.get("paypal-cert-url") || "",
      event,
    });
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof PaypalSandboxError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "No se pudo procesar el webhook." }, { status: 503 });
  }
}
