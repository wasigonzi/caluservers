import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/db";
import AccessDenied from "@/components/admin/AccessDenied";
import AdminUsersManager, { type AdminUserRow } from "@/components/admin/AdminUsersManager";
import { PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** Gestión de administradores (Fase 1, tramo D — RBAC). Exige `users:manage`. */
export default async function AdminUsersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("users:manage")) {
    return <AccessDenied permission="users:manage" />;
  }
  const [rows, roleRows] = await Promise.all([
    db.adminUser.findMany({
      select: {
        id: true,
        email: true,
        createdAt: true,
        lastLoginAt: true,
        disabledAt: true,
        mfaRequired: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.role.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const users: AdminUserRow[] = rows.map((row) => ({
    id: row.id,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    mfaRequired: row.mfaRequired,
    roles: row.roles.map((entry) => entry.role.name),
  }));
  return (
    <>
      <PageHeader
        eyebrow="CONFIGURACIÓN"
        title="Usuarios administradores"
        description="Cuentas del panel con su rol y estado. Deshabilitar cierra las sesiones de esa cuenta; el propietario inicial se crea con scripts/admin-migrate.mjs."
      />
      <AdminUsersManager initialUsers={users} roles={roleRows.map((r) => r.name)} />
    </>
  );
}
