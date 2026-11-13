import "server-only";
import { db } from "@/lib/db";

/**
 * Instrucciones de pago manual (transferencia, ATH Móvil, etc.) que el cliente
 * ve en sus facturas pendientes. Texto plano, editable desde el panel.
 * Vive en SiteSetting con clave propia: no forma parte de los ajustes públicos del sitio.
 */
const KEY = "billing_instructions";
export const PAYMENT_INSTRUCTIONS_MAX = 1200;

export async function paymentInstructions(): Promise<string> {
  try {
    const row = await db.siteSetting.findUnique({ where: { key: KEY } });
    const value = row?.value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const text = (value as Record<string, unknown>).text;
      if (typeof text === "string") return text.slice(0, PAYMENT_INSTRUCTIONS_MAX);
    }
  } catch {
    // Sin la tabla o sin base no hay instrucciones: la factura lo dice sin ellas.
  }
  return "";
}

export class BillingSettingsError extends Error {}

export async function savePaymentInstructions(raw: unknown): Promise<string> {
  if (typeof raw !== "string") throw new BillingSettingsError("Texto no válido.");
  // Solo texto: se quitan caracteres de control salvo saltos de línea.
  const text = raw.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
  if (text.length > PAYMENT_INSTRUCTIONS_MAX) {
    throw new BillingSettingsError(`Máximo ${PAYMENT_INSTRUCTIONS_MAX} caracteres.`);
  }
  await db.$transaction([
    db.siteSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: { text } },
      update: { value: { text } },
    }),
    db.adminAudit.create({
      data: { action: "billing.instructions.updated", details: `chars=${text.length}` },
    }),
  ]);
  return text;
}
