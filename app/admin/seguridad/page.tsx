import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminSession, isAdmin, sessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminMfaRequired } from "@/lib/totp";
import { adminOwnerId } from "@/lib/webauthn";
import { PageHeader } from "@/components/admin/ui";
import SecurityForms, {
  type PasskeyItem,
  type SessionItem,
} from "@/components/admin/SecurityForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguridad" };

export default async function AdminSecurityPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const ownerId = await adminOwnerId(session.email);
  let currentTokenHash: string | null = null;
  try {
    const token = (await cookies()).get(sessionCookie)?.value ?? null;
    if (token) currentTokenHash = createHash("sha256").update(token).digest("hex");
  } catch {
    currentTokenHash = null;
  }
  const [adminUser, passkeys, recoveryCodes, sessions] = await Promise.all([
    session.userId
      ? db.adminUser
          .findUnique({
            where: { id: session.userId },
            select: { totpSecretEncrypted: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
    db.passkeyCredential
      .findMany({
        where: { ownerType: "admin", ownerId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          credentialId: true,
          label: true,
          createdAt: true,
          lastUsedAt: true,
        },
      })
      .catch(() => []),
    db.recoveryCode
      .count({ where: { ownerType: "admin", ownerId, usedAt: null } })
      .catch(() => 0),
    db.adminSession
      .findMany({
        where: session.userId
          ? { adminUserId: session.userId, revokedAt: null, expiresAt: { gt: new Date() } }
          : { adminUserId: null, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          tokenHash: true,
          createdAt: true,
          lastSeenAt: true,
          userAgent: true,
        },
      })
      .catch(() => []),
  ]);
  const accountTotp = Boolean(adminUser?.totpSecretEncrypted);
  const envTotp = Boolean((process.env.ADMIN_TOTP_SECRET || "").trim());
  const sessionItems: SessionItem[] = sessions.map((item) => ({
    id: item.id,
    createdAt: item.createdAt.toISOString(),
    lastSeenAt: item.lastSeenAt?.toISOString() ?? null,
    userAgent: item.userAgent,
    current: currentTokenHash !== null && item.tokenHash === currentTokenHash,
  }));
  const passkeyItems: PasskeyItem[] = passkeys.map((item) => ({
    id: item.id,
    credentialId: item.credentialId,
    label: item.label,
    createdAt: item.createdAt.toISOString(),
    lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
  }));
  return (
    <>
      <PageHeader
        eyebrow="SEGURIDAD"
        title="Seguridad"
        description="Tus sesiones activas y tus factores de verificación en dos pasos: passkeys, código TOTP y códigos de recuperación. La passkey es el factor más fuerte: entra sin contraseña y resiste el phishing."
      />
      <SecurityForms
        totp={{
          enrolled: accountTotp || envTotp,
          source: accountTotp ? "account" : envTotp ? "env" : "none",
        }}
        passkeys={passkeyItems}
        recoveryCodesRemaining={recoveryCodes}
        sessions={sessionItems}
        mfaRequired={adminMfaRequired(process.env.ADMIN_MFA_REQUIRED)}
        canEnrolTotp={session.userId !== null}
      />
    </>
  );
}
