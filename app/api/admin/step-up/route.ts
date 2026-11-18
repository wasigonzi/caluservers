import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  requireAdmin,
  sessionCookie,
  verifyAdminPassword,
} from "@/lib/auth";
import { sanitizeAudit } from "@/lib/audit-sanitize";
import { db } from "@/lib/db";
import { clientRateKey } from "@/lib/login-rate-limit";
import { clearLoginThrottle, consumeLoginAttempt } from "@/lib/login-throttle-store";
import { adminTotpSecret, verifyAdminRecoveryCode } from "@/lib/mfa";
import { hashSessionToken, touchStepUp } from "@/lib/stepup";
import { totpConfig, verifyTotp } from "@/lib/totp";
import { trustedWrite } from "@/lib/request";
import { adminOwnerId } from "@/lib/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT_ERROR = "No se pudo comprobar el límite de acceso. La confirmación queda cerrada.";

/**
 * POST /api/admin/step-up — reautenticación para operaciones peligrosas
 * (Fase 6, frente C).
 *
 * Exige sesión de admin y vuelve a verificar la contraseña con
 * `verifyAdminPassword`. Si el admin tiene TOTP enrolado en su cuenta
 * (`AdminUser.totpSecretEncrypted`) o hay secreto TOTP en el entorno, el
 * código de 6 dígitos es obligatorio: vale el TOTP o un código de
 * recuperación de un solo uso (mismo criterio que el login, ver
 * `app/api/admin/login/route.ts`). Sin TOTP enrolado en ningún sitio,
 * basta la contraseña.
 *
 * Si acierta, marca `stepUpAt = now` en la sesión actual y devuelve
 * `{ ok: true, stepUpAt, mfaRequired }`. La confirmación vale 15 minutos
 * (`STEP_UP_MAX_AGE_MINUTES` en `lib/stepup.ts`). Los intentos fallidos
 * cuentan en el mismo limitador que el login (8 en 15 min por IP).
 */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const key = clientRateKey(req.headers);
  let decision: { allowed: boolean; retryAfterSec: number };
  try {
    decision = await consumeLoginAttempt(key);
  } catch {
    return NextResponse.json({ error: LIMIT_ERROR }, { status: 503 });
  }
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } },
    );
  }
  try {
    const session = await requireAdmin().catch(() => null);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password : "";
    const code = typeof body?.code === "string" ? body.code : "";
    if (!password) {
      return NextResponse.json({ error: "Falta la contraseña." }, { status: 400 });
    }
    if (!(await verifyAdminPassword(session.email, password))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Segundo factor: mismo criterio que el login. Primero el TOTP de la
    // cuenta; si la cuenta no tiene, el secreto del entorno.
    const ownerId = await adminOwnerId(session.email);
    const accountTotp = session.userId ? await adminTotpSecret(session.userId) : null;
    const envMfa = totpConfig(process.env.ADMIN_TOTP_SECRET);
    const mfaRequired = Boolean(accountTotp) || envMfa === "ready";
    if (envMfa === "invalid") {
      return NextResponse.json(
        { error: "MFA está definido pero no es un secreto TOTP válido." },
        { status: 500 },
      );
    }
    if (accountTotp) {
      const ok =
        verifyTotp(accountTotp, code) ||
        (code ? await verifyAdminRecoveryCode(ownerId, code) : false);
      if (!ok) {
        return NextResponse.json({ error: "Unauthorized", mfaRequired: true }, { status: 401 });
      }
    } else if (envMfa === "ready") {
      const secret = process.env.ADMIN_TOTP_SECRET || "";
      const ok =
        verifyTotp(secret, code) ||
        (code ? await verifyAdminRecoveryCode(ownerId, code) : false);
      if (!ok) {
        return NextResponse.json({ error: "Unauthorized", mfaRequired: true }, { status: 401 });
      }
    }
    const token = (await cookies()).get(sessionCookie)?.value ?? null;
    const marked =
      token && !token.includes(".") ? await touchStepUp({ tokenHash: hashSessionToken(token) }) : false;
    if (!marked) {
      return NextResponse.json(
        { error: "No se pudo registrar la confirmación. Vuelve a entrar." },
        { status: 500 },
      );
    }
    try {
      await clearLoginThrottle(key);
    } catch {
      // La confirmación ya quedó registrada; el limitador no la anula.
    }
    try {
      await db.adminAudit.create({
        data: {
          action: "auth.step_up",
          entityId: session.userId ?? undefined,
          details: sanitizeAudit({ action: "auth.step_up", actor: session.email }),
        },
      });
    } catch {
      // La auditoría no puede tumbar una confirmación correcta.
    }
    return NextResponse.json({
      ok: true,
      stepUpAt: new Date().toISOString(),
      mfaRequired,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo completar la confirmación." }, { status: 500 });
  }
}
