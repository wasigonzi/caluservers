/** Único origen de API admitido. No hay modo live. */
export const PAYPAL_SANDBOX_ORIGIN = "https://api-m.sandbox.paypal.com";

const LIVE_ORIGINS = new Set([
  "https://api-m.paypal.com",
  "https://api.paypal.com",
  "https://www.paypal.com",
]);

export class PaypalSandboxError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "PaypalSandboxError";
  }
}

export function paypalAmountValue(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new PaypalSandboxError("Importe no válido.", 400, "amount");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function assertSandboxUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PaypalSandboxError("La URL de PayPal no es válida.", 409, "live-rejected");
  }
  if (url.origin !== PAYPAL_SANDBOX_ORIGIN || LIVE_ORIGINS.has(url.origin)) {
    throw new PaypalSandboxError("Solo se admite el API sandbox de PayPal. El modo live está rechazado.", 409, "live-rejected");
  }
  return url;
}

export function assertSandboxCertUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PaypalSandboxError("El certificado del webhook no es de sandbox.", 400, "webhook");
  }
  const allowed = url.protocol === "https:" && (url.hostname === "api-m.sandbox.paypal.com" || url.hostname === "api.sandbox.paypal.com") && url.pathname.startsWith("/v1/notifications/certs/");
  if (!allowed) throw new PaypalSandboxError("El certificado del webhook no es de sandbox.", 400, "webhook");
}

export function assertApprovalUrl(raw: string, fixture: boolean): void {
  let url: URL;
  try {
    url = new URL(raw, "https://caluservers.local");
  } catch {
    throw new PaypalSandboxError("El enlace de aprobación no es válido.", 502, "approval");
  }
  if (fixture) {
    if (!url.pathname.startsWith("/cuenta/paypal/simular")) {
      throw new PaypalSandboxError("El simulador local solo puede aprobar en esta aplicación.", 409, "approval");
    }
    return;
  }
  if (url.protocol !== "https:" || url.hostname !== "www.sandbox.paypal.com") {
    throw new PaypalSandboxError("La aprobación tiene que ocurrir en www.sandbox.paypal.com.", 502, "approval");
  }
}

export type PaypalRuntime =
  | { ok: true; fixture: boolean; testFiscal: boolean }
  | { ok: false; code: "unconfigured" | "live-rejected" | "fixture-forbidden" };

export function paypalRuntime(env: NodeJS.ProcessEnv = process.env, nodeEnv = process.env.NODE_ENV): PaypalRuntime {
  const mode = (env.PAYPAL_MODE || "").trim().toLowerCase();
  if (mode && mode !== "sandbox") return { ok: false, code: "live-rejected" };
  const base = (env.PAYPAL_API_BASE || "").trim();
  if (base) {
    try {
      assertSandboxUrl(base.endsWith("/") ? base.slice(0, -1) : base);
    } catch {
      return { ok: false, code: "live-rejected" };
    }
  }
  const fixtureRequested = (env.PAYPAL_SANDBOX_FIXTURE || "").trim() === "local";
  if (fixtureRequested && nodeEnv === "production") return { ok: false, code: "fixture-forbidden" };
  if (fixtureRequested) return { ok: true, fixture: true, testFiscal: testFiscalAllowed(env, nodeEnv) };
  const id = (env.PAYPAL_SANDBOX_CLIENT_ID || "").trim();
  const secret = (env.PAYPAL_SANDBOX_CLIENT_SECRET || "").trim();
  const webhook = (env.PAYPAL_SANDBOX_WEBHOOK_ID || "").trim();
  if (!id || !secret || !webhook) return { ok: false, code: "unconfigured" };
  return { ok: true, fixture: false, testFiscal: false };
}

export function testFiscalAllowed(env: NodeJS.ProcessEnv = process.env, nodeEnv = process.env.NODE_ENV): boolean {
  if (nodeEnv === "production") return false;
  return (env.PAYPAL_SANDBOX_TEST_FISCAL || "").trim() === "isolated";
}

export function sandboxAccessTokenIgnored(env: NodeJS.ProcessEnv = process.env): boolean {
  return !("PAYPAL_SANDBOX_ACCESS_TOKEN" in Object.keys(env).reduce((acc, key) => {
    if (key === "PAYPAL_SANDBOX_CLIENT_ID" || key === "PAYPAL_SANDBOX_CLIENT_SECRET" || key === "PAYPAL_SANDBOX_WEBHOOK_ID") acc[key] = true;
    return acc;
  }, {} as Record<string, boolean>));
}

export const PAYPAL_APP_ENV = ["PAYPAL_SANDBOX_CLIENT_ID", "PAYPAL_SANDBOX_CLIENT_SECRET", "PAYPAL_SANDBOX_WEBHOOK_ID"] as const;
