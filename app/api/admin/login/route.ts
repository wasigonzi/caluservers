import { NextRequest, NextResponse } from "next/server";
import { createSession, sessionCookie, verifyAdminPassword } from "@/lib/auth";
import { checkSuspiciousAdminLogin } from "@/lib/alerts";
import { clientRateKey } from "@/lib/login-rate-limit";
import { clearLoginThrottle, consumeLoginAttempt } from "@/lib/login-throttle-store";
import { adminTotpSecret, verifyAdminRecoveryCode } from "@/lib/mfa";
import { totpConfig, verifyTotp, adminMfaRequired, hasPasskeyEnrolled } from "@/lib/totp";
import { adminOwnerId } from "@/lib/webauthn";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";

const LIMIT_ERROR = "No se pudo comprobar el límite de acceso. El ingreso queda cerrado.";

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
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
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const code = typeof body?.code === "string" ? body.code : "";
    if (!(await verifyAdminPassword(email, password))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const mfaRequired = adminMfaRequired(process.env.ADMIN_MFA_REQUIRED);
    // Fase 1, tramo C: el segundo factor es POR CUENTA. Primero el TOTP
    // enrolado en la cuenta (AdminUser.totpSecretEncrypted); si la cuenta
    // no tiene, el secreto del entorno; y una passkey enrolada también
    // cuenta como método MFA para el bloqueo. Un código de recuperación
    // válido (de un solo uso) vale como el código TOTP en ambos caminos.
    const ownerId = await adminOwnerId(email);
    const accountTotp = await adminTotpSecret(ownerId);
    const envMfa = totpConfig(process.env.ADMIN_TOTP_SECRET, mfaRequired);
    const passkeyEnrolled = await hasPasskeyEnrolled("admin", ownerId);
    if (mfaRequired && !accountTotp && envMfa === "required-but-missing" && !passkeyEnrolled) {
      // Solo se llega aquí con la contraseña correcta: no enumera cuentas.
      // El administrador debe enrolar TOTP (npm run admin:totp) o, en Fase 1,
      // una passkey, antes de poder entrar.
      return NextResponse.json(
        {
          error:
            "El acceso de administrador exige MFA, pero no hay ningún método enrolado. Enrola un código TOTP (ADMIN_TOTP_SECRET) antes de entrar.",
          mfaEnrollmentRequired: true,
        },
        { status: 403 },
      );
    }
    if (envMfa === "invalid") {
      return NextResponse.json(
        { error: "MFA está definido pero no es un secreto TOTP válido." },
        { status: 500 },
      );
    }
    const mfaCodeOk = async (secret: string): Promise<boolean> => {
      if (verifyTotp(secret, code)) return true;
      if (code && (await verifyAdminRecoveryCode(ownerId, code))) return true;
      return false;
    };
    if (accountTotp) {
      if (!(await mfaCodeOk(accountTotp))) {
        return NextResponse.json(
          { error: "Unauthorized", mfaRequired: true },
          { status: 401 },
        );
      }
    } else if (envMfa === "ready") {
      if (!(await mfaCodeOk(process.env.ADMIN_TOTP_SECRET || ""))) {
        return NextResponse.json(
          { error: "Unauthorized", mfaRequired: true },
          { status: 401 },
        );
      }
    }
    try {
      await clearLoginThrottle(key);
    } catch {
      return NextResponse.json({ error: LIMIT_ERROR }, { status: 503 });
    }
    // Login sospechoso (Fase 6): solo si hay historial previo de IP para
    // este admin y la IP actual es distinta. Sin historial no se alerta.
    // Se comprueba ANTES de crear la sesión, para que la sesión nueva no
    // entre en el historial. `key` es la IP del cliente (o "local" sin
    // cabecera); `ownerId` es `env:<correo>` sin AdminUser en BD, y en
    // ese caso el historial son las sesiones con adminUserId null.
    // Nunca bloquea el login: si la comprobación falla, se entra igual.
    await checkSuspiciousAdminLogin({
      adminUserId: ownerId.startsWith("env:") ? null : ownerId,
      email,
      ip: key,
    }).catch(() => {});
    const res = NextResponse.json({ ok: true });
    res.cookies.set(
      sessionCookie,
      await createSession(email, {
        ip: key,
        userAgent: req.headers.get("user-agent") ?? undefined,
      }),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 28800,
      },
    );
    return res;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
