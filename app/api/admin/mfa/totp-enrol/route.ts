import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { sealAdminTotpSecret, totpOtpAuthUrl, verifyEnrolmentCode } from "@/lib/mfa";
import { generateTotpSecret } from "@/lib/totp";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";

/**
 * Enrolamiento TOTP por cuenta (dos pasos, Fase 1, tramo C).
 *
 * 1. POST sin `code`: genera un secreto y lo devuelve con su URL otpauth
 *    para la app autenticadora. NO se guarda nada todavía.
 * 2. POST con `secret` + `code`: solo si el código verifica contra ese
 *    secreto se cifra (secret-box, AAD por cuenta) y se guarda en
 *    AdminUser.totpSecretEncrypted. El TOTP pasa a exigirse en el login.
 *
 * Solo funciona con AdminUser en BD: el admin por entorno no tiene fila
 * donde guardar el secreto y sigue con ADMIN_TOTP_SECRET.
 */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.userId) {
    return NextResponse.json(
      {
        error:
          "El TOTP por cuenta exige migrar la cuenta de administrador a la base (node scripts/admin-migrate.mjs). Mientras tanto, el MFA sigue por ADMIN_TOTP_SECRET.",
      },
      { status: 409 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo no válido." }, { status: 400 });
  }
  const secret = typeof (body as { secret?: unknown })?.secret === "string" ? (body as { secret: string }).secret : "";
  const code = typeof (body as { code?: unknown })?.code === "string" ? (body as { code: string }).code : "";
  if (!secret && !code) {
    const fresh = generateTotpSecret();
    return NextResponse.json({
      secret: fresh,
      otpauthUrl: totpOtpAuthUrl("CaluServers", session.email, fresh),
    });
  }
  if (!secret || !code) {
    return NextResponse.json(
      { error: "Faltan el secreto y el código de verificación." },
      { status: 400 },
    );
  }
  if (!verifyEnrolmentCode(secret, code)) {
    return NextResponse.json(
      { error: "El código no verifica contra ese secreto." },
      { status: 400 },
    );
  }
  try {
    await db.adminUser.update({
      where: { id: session.userId },
      data: { totpSecretEncrypted: sealAdminTotpSecret(session.userId, secret) },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el secreto TOTP." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
