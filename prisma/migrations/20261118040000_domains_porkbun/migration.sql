-- Fase 3: dominios con Porkbun (registrador) + permisos de dominios.
--
-- Modelos nuevos: TldPrice, RegisteredDomain (ver prisma/schema.prisma).
-- TldPrice guarda el precio de venta por TLD y registrador en céntimos de
-- USD; una fila con active=false no se vende nunca (el precio 0 es "sin
-- precio", nunca $0). RegisteredDomain guarda el dominio del cliente, su
-- estado, su vencimiento, el flag local de auto-renew y, solo durante una
-- transferencia entrante, el código EPP cifrado con secret-box.
-- Aditiva: no toca ninguna tabla existente ni borra datos.
-- Semilla: permisos domains:view/domains:write para owner y admin (soporte
-- no los recibe: los dominios los gestionan owner y admin); filas de plugin
-- desactivadas para porkbun y godaddy (las credenciales las pone el admin
-- desde /admin/plugins; sin ellas el adaptador responde 503).

CREATE TABLE "TldPrice" (
    "id" TEXT NOT NULL,
    "tld" TEXT NOT NULL,
    "registrarKey" TEXT NOT NULL DEFAULT 'porkbun',
    "registerCents" INTEGER NOT NULL,
    "renewCents" INTEGER NOT NULL,
    "transferCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "years" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TldPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TldPrice_tld_registrarKey_key" ON "TldPrice"("tld", "registrarKey");
CREATE INDEX "TldPrice_active_idx" ON "TldPrice"("active");

CREATE TABLE "RegisteredDomain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "registrarKey" TEXT NOT NULL DEFAULT 'porkbun',
    "registryId" TEXT,
    "status" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "nameservers" JSONB,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "authCodeEncrypted" TEXT,
    "failureReason" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegisteredDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegisteredDomain_domain_key" ON "RegisteredDomain"("domain");
CREATE INDEX "RegisteredDomain_userId_idx" ON "RegisteredDomain"("userId");
CREATE INDEX "RegisteredDomain_expiresAt_idx" ON "RegisteredDomain"("expiresAt");

-- Permisos de dominios. Ids deterministas para que la semilla sea idempotente.
INSERT INTO "Permission" ("id", "key", "description") VALUES
    ('perm_domains_view', 'domains:view', 'Ver dominios registrados y precios de TLD'),
    ('perm_domains_write', 'domains:write', 'Gestionar dominios: registrar, renovar, transferir y reintentar')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_owner', "id" FROM "Permission"
WHERE "key" IN ('domains:view', 'domains:write')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_admin', "id" FROM "Permission"
WHERE "key" IN ('domains:view', 'domains:write')
ON CONFLICT DO NOTHING;

INSERT INTO "Plugin" ("id", "key", "kind", "label", "enabled", "updatedAt")
VALUES
  ('plugin_porkbun', 'porkbun', 'registrar', 'Porkbun', false, CURRENT_TIMESTAMP),
  ('plugin_godaddy', 'godaddy', 'registrar', 'GoDaddy', false, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
