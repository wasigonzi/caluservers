import { NextRequest, NextResponse } from "next/server";
import {
  AuthorizationError,
  requireAdmin,
  requirePermission,
  verifyAdminPassword,
  type AdminSessionInfo,
} from "@/lib/auth";
import { STEP_UP_ERROR_CODE, STEP_UP_MESSAGE, StepUpRequiredError, requireStepUp } from "@/lib/stepup";
import { sanitizeAudit } from "@/lib/audit-sanitize";
import { writeAuditLog } from "@/lib/audit-log";
import { raiseAlert } from "@/lib/alerts";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mínimo de contraseña para un admin nuevo (igual que el registro de promotor). */
const ADMIN_MIN_PASSWORD = 8;

type PublicAdminUser = {
  id: string;
  email: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  disabledAt: Date | null;
  mfaRequired: boolean;
  roles: string[];
};

const USER_SELECT = {
  id: true,
  email: true,
  createdAt: true,
  lastLoginAt: true,
  disabledAt: true,
  mfaRequired: true,
  roles: { select: { role: { select: { name: true } } } },
} as const;

function publicUser(row: {
  id: string;
  email: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  disabledAt: Date | null;
  mfaRequired: boolean;
  roles: { role: { name: string } }[];
}): PublicAdminUser {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
    disabledAt: row.disabledAt,
    mfaRequired: row.mfaRequired,
    roles: row.roles.map((entry) => entry.role.name),
  };
}

async function auditUserEvent(
  action: string,
  session: AdminSessionInfo,
  target: { id: string; email: string },
): Promise<void> {
  try {
    await db.adminAudit.create({
      data: {
        action,
        entityId: target.id,
        details: sanitizeAudit({
          action,
          actor: session.email,
          user: target.email,
        }),
      },
    });
    // Doble escritura (Fase 6): también a AuditLog.
    await writeAuditLog({
      actorType: "admin",
      actorId: session.email,
      action,
      resourceType: "adminUser",
      resourceId: target.id,
      details: {
        action,
        actor: session.email,
        user: target.email,
      },
    });
  } catch {
    // La auditoría no puede tumbar la operación.
  }
}

async function assertUsersManage(): Promise<
  { session: AdminSessionInfo } | { denied: NextResponse }
> {
  try {
    return { session: await requirePermission("users:manage") };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return {
        denied: NextResponse.json(
          { error: "Sin permiso para esta acción." },
          { status: 403 },
        ),
      };
    }
    return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}

/** Lista de administradores (sin hashes ni secretos TOTP). */
export async function GET() {
  const checked = await assertUsersManage();
  if ("denied" in checked) return checked.denied;
  const rows = await db.adminUser.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(
    { users: rows.map(publicUser) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";

  // Cambio de contraseña propia (Fase 6, frente B): es el punto donde se
  // engancha la alerta `admin.password_changed`. No exige `users:manage`
  // (eso es gestionar a otros); basta la sesión y la contraseña actual,
  // que aquí hace de reautenticación. La contraseña del fallback por
  // entorno no se cambia desde el panel: no hay AdminUser en BD al que
  // escribirle el hash. No hay formulario en /admin/seguridad todavía:
  // esta acción es la API que ese formulario usará.
  if (action === "change-password") {
    let session: AdminSessionInfo;
    try {
      session = await requireAdmin();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const current = String(body?.currentPassword || "");
    const next = String(body?.newPassword || "");
    if (next.length < ADMIN_MIN_PASSWORD) {
      return NextResponse.json(
        { error: `La contraseña nueva debe tener al menos ${ADMIN_MIN_PASSWORD} caracteres.` },
        { status: 400 },
      );
    }
    if (!session.userId) {
      return NextResponse.json(
        {
          error:
            "Esta cuenta usa la contraseña del entorno y no se cambia desde el panel. Migra el propietario a la base primero.",
        },
        { status: 409 },
      );
    }
    if (!(await verifyAdminPassword(session.email, current))) {
      return NextResponse.json({ error: "La contraseña actual no coincide." }, { status: 401 });
    }
    await db.adminUser.update({
      where: { id: session.userId },
      data: { passwordHash: await hashPassword(next) },
    });
    await auditUserEvent("admin.password_changed", session, {
      id: session.userId,
      email: session.email,
    });
    await raiseAlert({
      ruleKey: "admin.password_changed",
      severity: "warning",
      title: `Contraseña cambiada: ${session.email}`,
      body: `La contraseña del administrador ${session.email} se cambió desde el panel. Si no fuiste tú, cambia la contraseña de nuevo y revisa las sesiones en /admin/seguridad.`,
      resourceType: "adminUser",
      resourceId: session.userId,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  const checked = await assertUsersManage();
  if ("denied" in checked) return checked.denied;
  const session = checked.session;

  if (action === "create") {
    // El alta asigna un rol: es la única vía que crea un administrador con
    // permisos, así que exige step-up reciente (Fase 6, frente C). No hay
    // una acción suelta de asignar/quitar roles en esta ruta: cuando se
    // añada, debe pasar por este mismo control (ver docs/SEGURIDAD-RBAC.md).
    try {
      requireStepUp(session);
    } catch (error) {
      if (error instanceof StepUpRequiredError) {
        return NextResponse.json(
          { error: STEP_UP_ERROR_CODE, message: STEP_UP_MESSAGE },
          { status: 403 },
        );
      }
      throw error;
    }
  }

  if (action === "create") {
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const roleName = String(body?.role || "").trim();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Correo no válido." }, { status: 400 });
    }
    if (password.length < ADMIN_MIN_PASSWORD) {
      return NextResponse.json(
        { error: `La contraseña debe tener al menos ${ADMIN_MIN_PASSWORD} caracteres.` },
        { status: 400 },
      );
    }
    if (!roleName) {
      return NextResponse.json({ error: "Falta el rol." }, { status: 400 });
    }
    // El propietario inicial se crea con scripts/admin-migrate.mjs, no
    // desde aquí: sin admins en BD no hay quien autorice el alta.
    if ((await db.adminUser.count()) === 0) {
      return NextResponse.json(
        {
          error:
            "Aún no hay administradores en la base. Crea el propietario con scripts/admin-migrate.mjs.",
        },
        { status: 409 },
      );
    }
    const existing = await db.adminUser.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un administrador con ese correo." },
        { status: 409 },
      );
    }
    const role = await db.role.findUnique({ where: { name: roleName } });
    if (!role) {
      return NextResponse.json({ error: "Rol no existente." }, { status: 400 });
    }
    // Solo un owner asigna el rol owner.
    if (roleName === "owner" && !session.roles.includes("owner")) {
      return NextResponse.json(
        { error: "Solo un owner puede asignar el rol owner." },
        { status: 403 },
      );
    }
    const created = await db.adminUser.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        roles: { create: { roleId: role.id } },
      },
      include: { roles: { include: { role: { select: { name: true } } } } },
    });
    await auditUserEvent("admin.user_created", session, created);
    return NextResponse.json({ user: publicUser(created) }, { status: 201 });
  }

  if (action === "disable" || action === "enable") {
    const userId = String(body?.userId || "");
    if (!userId) {
      return NextResponse.json({ error: "Falta el administrador." }, { status: 400 });
    }
    const target = await db.adminUser.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    if (!target) {
      return NextResponse.json({ error: "Administrador no encontrado." }, { status: 404 });
    }
    if (action === "disable") {
      if (userId === session.userId) {
        return NextResponse.json(
          { error: "No puedes deshabilitar tu propia cuenta." },
          { status: 409 },
        );
      }
      // No dejar el panel sin ningún owner habilitado.
      if (target.roles.some((entry) => entry.role.name === "owner")) {
        const enabledOwners = await db.adminUser.count({
          where: {
            disabledAt: null,
            roles: { some: { role: { name: "owner" } } },
          },
        });
        if (enabledOwners <= 1) {
          return NextResponse.json(
            { error: "No se puede deshabilitar el último owner habilitado." },
            { status: 409 },
          );
        }
      }
      const updated = await db.adminUser.update({
        where: { id: userId },
        data: { disabledAt: new Date() },
        select: USER_SELECT,
      });
      // Cerrar sus sesiones: un admin deshabilitado no entra por ninguna vía.
      await db.adminSession
        .updateMany({ where: { adminUserId: userId, revokedAt: null }, data: { revokedAt: new Date() } })
        .catch(() => {});
      await auditUserEvent("admin.user_disabled", session, updated);
      return NextResponse.json({ user: publicUser(updated) });
    }
    const updated = await db.adminUser.update({
      where: { id: userId },
      data: { disabledAt: null },
      select: USER_SELECT,
    });
    await auditUserEvent("admin.user_enabled", session, updated);
    return NextResponse.json({ user: publicUser(updated) });
  }

  return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
}
