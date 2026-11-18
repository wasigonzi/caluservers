-- Fase 1, tramo B: identidad de administrador y RBAC (cimiento).
--
-- Modelos nuevos: AdminUser, AdminSession, PasskeyCredential, RecoveryCode,
-- Role, Permission, RolePermission, AdminUserRole (ver prisma/schema.prisma).
-- Las contraseñas de administrador pasan de la variable de entorno
-- ADMIN_PASSWORD_HASH (scrypt) a AdminUser.passwordHash (Argon2id); el
-- login por entorno sigue solo como fallback durante la ventana de
-- migración de 7 días (ver lib/auth.ts y docs/SEGURIDAD-RBAC.md).
-- Las cookies HMAC anteriores (`payload.firma`) dejan de valer: las sesiones
-- viven ahora en AdminSession y en la cookie solo viaja el token.
-- PasskeyCredential y RecoveryCode se crean en este tramo; el enrolamiento
-- y la verificación de passkeys/códigos llegan en tramos posteriores.
-- Aditiva: no toca ninguna tabla existente ni borra datos.

CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mfaRequired" BOOLEAN NOT NULL DEFAULT true,
    "totpSecretEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "stepUpAt" TIMESTAMP(3),

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE INDEX "AdminSession_adminUserId_expiresAt_idx" ON "AdminSession"("adminUserId", "expiresAt");

ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PasskeyCredential" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "label" TEXT,

    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasskeyCredential_credentialId_key" ON "PasskeyCredential"("credentialId");
CREATE INDEX "PasskeyCredential_ownerType_ownerId_idx" ON "PasskeyCredential"("ownerType", "ownerId");

CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecoveryCode_codeHash_key" ON "RecoveryCode"("codeHash");

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AdminUserRole" (
    "adminUserId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "AdminUserRole_pkey" PRIMARY KEY ("adminUserId", "roleId")
);

ALTER TABLE "AdminUserRole" ADD CONSTRAINT "AdminUserRole_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminUserRole" ADD CONSTRAINT "AdminUserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permisos iniciales. Ids deterministas para que la semilla sea idempotente.
INSERT INTO "Permission" ("id", "key", "description") VALUES
    ('perm_orders_view', 'orders:view', 'Ver pedidos'),
    ('perm_orders_confirm', 'orders:confirm', 'Confirmar pedidos y cobros'),
    ('perm_services_view', 'services:view', 'Ver servicios'),
    ('perm_services_provision', 'services:provision', 'Dar de alta servicios en WHM'),
    ('perm_services_suspend', 'services:suspend', 'Suspender servicios'),
    ('perm_tickets_view', 'tickets:view', 'Ver tickets de soporte'),
    ('perm_tickets_reply', 'tickets:reply', 'Responder tickets de soporte'),
    ('perm_clients_view', 'clients:view', 'Ver clientes'),
    ('perm_catalog_write', 'catalog:write', 'Editar el catálogo y los precios'),
    ('perm_content_write', 'content:write', 'Editar contenidos y páginas'),
    ('perm_appearance_write', 'appearance:write', 'Editar la apariencia del sitio'),
    ('perm_settings_write', 'settings:write', 'Editar ajustes de la plataforma'),
    ('perm_whm_read', 'whm:read', 'Leer el estado de WHM'),
    ('perm_whm_write', 'whm:write', 'Escribir en WHM (altas y suspensiones)'),
    ('perm_users_manage', 'users:manage', 'Gestionar usuarios administradores'),
    ('perm_roles_manage', 'roles:manage', 'Gestionar roles y permisos'),
    ('perm_audit_view', 'audit:view', 'Ver el diario de auditoría'),
    ('perm_payments_confirm', 'payments:confirm', 'Confirmar pagos')
ON CONFLICT DO NOTHING;

-- Roles iniciales. La rotación de claves queda reservada a owner sin
-- permiso propio por ahora; admin tiene todo menos roles:manage.
INSERT INTO "Role" ("id", "name", "description") VALUES
    ('role_owner', 'owner', 'Acceso total, incluida la gestión de roles y permisos.'),
    ('role_admin', 'admin', 'Acceso total excepto la gestión de roles y permisos.'),
    ('role_soporte', 'soporte', 'Tickets, clientes, pedidos y servicios en lectura, más auditoría en lectura.')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_owner', "id" FROM "Permission"
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_admin', "id" FROM "Permission" WHERE "key" <> 'roles:manage'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_soporte', "id" FROM "Permission"
WHERE "key" IN ('tickets:view', 'tickets:reply', 'clients:view', 'orders:view', 'services:view', 'audit:view')
ON CONFLICT DO NOTHING;
