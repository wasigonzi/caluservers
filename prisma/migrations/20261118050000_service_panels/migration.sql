-- Fase 4, frente A: selección de panel por servicio (WHM completo) +
-- permiso services:terminate.
--
-- CustomerService gana panelKey ("whm" por defecto: nada existente cambia
-- de comportamiento) y panelAccountId (el usuario en ese panel; para WHM
-- es el cpanelUser). ProvisionSetting gana panelByPlan (panel por plan de
-- hosting; si falta uno, el servicio nace con "whm").
-- Permiso nuevo services:terminate para owner y admin (soporte NO lo
-- recibe: terminar una cuenta es irreversible). La siembra de owner/admin
-- es idempotente (ON CONFLICT DO NOTHING).
-- Aditiva: no toca ninguna tabla existente ni borra datos.

ALTER TABLE "CustomerService" ADD COLUMN "panelKey" TEXT NOT NULL DEFAULT 'whm';
ALTER TABLE "CustomerService" ADD COLUMN "panelAccountId" TEXT;
ALTER TABLE "ProvisionSetting" ADD COLUMN "panelByPlan" JSONB;

INSERT INTO "Permission" ("id", "key", "description") VALUES
    ('perm_services_terminate', 'services:terminate', 'Terminar cuentas en el panel de hosting')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_owner', "id" FROM "Permission" WHERE "key" = 'services:terminate'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_admin', "id" FROM "Permission" WHERE "key" = 'services:terminate'
ON CONFLICT DO NOTHING;
