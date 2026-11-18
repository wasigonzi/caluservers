import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, getAdminSession, type AdminSessionInfo } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";
import { clientSafeError } from "@/lib/client-error";
import { sanitizeAudit } from "@/lib/audit-sanitize";
import { writeAuditLog } from "@/lib/audit-log";
import { db } from "@/lib/db";
import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings-db";
import {
  DEFAULT_SITE_SETTINGS,
  parseSiteSettings,
  settingsToRows,
  validateSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Los ajustes del sitio mezclan contenido y apariencia (el estudio publica
 * todo el bundle junto), así que leerlos y guardarlos exige
 * `content:write` O `appearance:write` (Fase 1, tramo D — RBAC). Con
 * ninguno de los dos, un solo evento `authz.denied` como requirePermission.
 */
async function requireStudioWrite(): Promise<AdminSessionInfo> {
  const session = await getAdminSession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (
    session.permissions.includes("content:write") ||
    session.permissions.includes("appearance:write")
  ) {
    return session;
  }
  try {
    await db.adminAudit.create({
      data: {
        action: "authz.denied",
        entityId: session.userId ?? undefined,
        details: sanitizeAudit({
          action: "authz.denied",
          actor: session.email,
          permission: "content:write|appearance:write",
          reason: "missing-permission",
        }),
      },
    });
    // Doble escritura (Fase 6): también a AuditLog.
    await writeAuditLog({
      actorType: "admin",
      actorId: session.email,
      action: "authz.denied",
      resourceType: "adminUser",
      resourceId: session.userId ?? undefined,
      details: {
        action: "authz.denied",
        actor: session.email,
        permission: "content:write|appearance:write",
        reason: "missing-permission",
      },
    });
  } catch {
    // La denegación no depende de que la auditoría se guarde.
  }
  throw new AuthorizationError("content:write");
}

async function assertStudioWrite(): Promise<NextResponse | null> {
  try {
    await requireStudioWrite();
    return null;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sin permiso para esta acción." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

function coerceSettings(body: unknown): SiteSettings {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return structuredClone(DEFAULT_SITE_SETTINGS);
  }
  const b = body as SiteSettings;
  return parseSiteSettings(settingsToRows(b), DEFAULT_SITE_SETTINGS);
}

export async function GET() {
  const denied = await assertStudioWrite();
  if (denied) return denied;
  const settings = await getSiteSettings();
  return NextResponse.json(
    { settings, defaults: DEFAULT_SITE_SETTINGS },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const denied = await assertStudioWrite();
  if (denied) return denied;
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    if (body?.action === "restore") {
      const saved = await saveSiteSettings(
        structuredClone(DEFAULT_SITE_SETTINGS),
      );
      return NextResponse.json({ ok: true, settings: saved });
    }
    const candidate = coerceSettings(body?.settings ?? body);
    const err = validateSiteSettings(candidate);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const saved = await saveSiteSettings(candidate);
    return NextResponse.json({ ok: true, settings: saved });
  } catch (e) {
    const safe = clientSafeError(e);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
