import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "@/lib/mfa";
import { trustedWrite } from "@/lib/request";
import { adminOwnerId } from "@/lib/webauthn";

export const runtime = "nodejs";

/**
 * Genera 10 códigos de recuperación nuevos. Los anteriores sin usar
 * quedan invalidados. Los códigos se muestran UNA sola vez en la
 * respuesta: en BD solo quedan sus hashes SHA-256 (RecoveryCode).
 */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = await adminOwnerId(session.email);
  const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  try {
    await db.$transaction([
      db.recoveryCode.deleteMany({
        where: { ownerType: "admin", ownerId, usedAt: null },
      }),
      db.recoveryCode.createMany({
        data: codes.map((code) => ({
          ownerType: "admin",
          ownerId,
          codeHash: hashRecoveryCode(code),
        })),
      }),
    ]);
  } catch {
    return NextResponse.json(
      { error: "No se pudieron generar los códigos." },
      { status: 500 },
    );
  }
  return NextResponse.json({ codes, count: codes.length });
}
