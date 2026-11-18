import { NextResponse } from "next/server";
import { adminMfaRequired } from "@/lib/totp";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminOwnerId } from "@/lib/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Factores MFA del administrador actual: TOTP, passkeys y códigos. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = await adminOwnerId(session.email);
  try {
    const [adminUser, passkeys, recoveryCodes] = await Promise.all([
      session.userId
        ? db.adminUser.findUnique({
            where: { id: session.userId },
            select: { totpSecretEncrypted: true },
          })
        : Promise.resolve(null),
      db.passkeyCredential.findMany({
        where: { ownerType: "admin", ownerId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          credentialId: true,
          label: true,
          createdAt: true,
          lastUsedAt: true,
        },
      }),
      db.recoveryCode.count({
        where: { ownerType: "admin", ownerId, usedAt: null },
      }),
    ]);
    const accountTotp = Boolean(adminUser?.totpSecretEncrypted);
    const envTotp = Boolean((process.env.ADMIN_TOTP_SECRET || "").trim());
    return NextResponse.json({
      totp: {
        enrolled: accountTotp || envTotp,
        // "account": secreto propio de la cuenta; "env": secreto del entorno.
        source: accountTotp ? "account" : envTotp ? "env" : "none",
      },
      passkeys,
      recoveryCodesRemaining: recoveryCodes,
      mfaRequired: adminMfaRequired(process.env.ADMIN_MFA_REQUIRED),
    });
  } catch {
    return NextResponse.json({ error: "No se pudieron leer los factores." }, { status: 500 });
  }
}
