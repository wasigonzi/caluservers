-- Fase 6: fraude propio, auditoría unificada y alertas.
--
-- Modelos nuevos: FraudRule, FraudFlag, AuditLog, AlertRule, Alert (ver
-- prisma/schema.prisma). Aditiva: no toca ninguna tabla existente ni
-- borra datos. Semilla: permiso reports:view para owner y admin; 4 reglas
-- de fraude ACTIVAS solo en modo "flag" (marcan, nunca bloquean un pago
-- real por defecto); reglas de alerta para los disparadores definidos en
-- docs/ALERTAS.md. MaxMind NO se activa aquí: solo esqueleto documentado
-- en docs/FRAUDE.md.

CREATE TABLE "FraudRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "configJson" JSONB,
    "action" TEXT NOT NULL DEFAULT 'flag',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FraudRule_active_order_idx" ON "FraudRule"("active", "order");

CREATE TABLE "FraudFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "ruleId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudFlag_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FraudFlag_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "FraudRule"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "FraudFlag_status_createdAt_idx" ON "FraudFlag"("status", "createdAt");
CREATE INDEX "FraudFlag_orderId_idx" ON "FraudFlag"("orderId");
CREATE INDEX "FraudFlag_userId_idx" ON "FraudFlag"("userId");

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "details" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_actorType_createdAt_idx" ON "AuditLog"("actorType", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'admin_panel',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertRule_key_key" ON "AlertRule"("key");
CREATE INDEX "AlertRule_active_idx" ON "AlertRule"("active");

CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Alert_ruleKey_fkey" FOREIGN KEY ("ruleKey") REFERENCES "AlertRule"("key") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Alert_readAt_createdAt_idx" ON "Alert"("readAt", "createdAt");
CREATE INDEX "Alert_ruleKey_createdAt_idx" ON "Alert"("ruleKey", "createdAt");

-- Permiso de informes para owner y admin.
INSERT INTO "Permission" ("id", "key", "description") VALUES
    ('perm_reports_view', 'reports:view', 'Ver los informes de antigüedad, ingresos y suscripciones')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_owner', "id" FROM "Permission"
WHERE "key" IN ('reports:view')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_admin', "id" FROM "Permission"
WHERE "key" IN ('reports:view')
ON CONFLICT DO NOTHING;

-- Reglas de fraude iniciales: todas en modo "flag" (marcan, no bloquean).
INSERT INTO "FraudRule" ("id", "name", "kind", "configJson", "action", "active", "order", "updatedAt") VALUES
    ('fraud_velocity', 'Demasiados pedidos en una hora', 'velocity', '{"maxOrders": 3, "windowMinutes": 60}', 'flag', true, 1, CURRENT_TIMESTAMP),
    ('fraud_amount', 'Pedido de importe alto', 'amount', '{"maxCents": 50000}', 'flag', true, 2, CURRENT_TIMESTAMP),
    ('fraud_disposable_email', 'Correo de dominio desechable', 'email_domain', '{"domains": ["mailinator.com", "tempmail.com", "guerrillamail.com", "10minutemail.com", "yopmail.com"]}', 'flag', true, 3, CURRENT_TIMESTAMP),
    ('fraud_shared_ip', 'Muchas cuentas desde la misma IP', 'ip', '{"maxAccounts": 3}', 'flag', true, 4, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Reglas de alerta iniciales (canal panel; el correo solo con SMTP).
INSERT INTO "AlertRule" ("id", "key", "channel", "active", "updatedAt") VALUES
    ('alert_admin_login_suspicious', 'admin.login_suspicious', 'admin_panel', true, CURRENT_TIMESTAMP),
    ('alert_admin_password_changed', 'admin.password_changed', 'admin_panel', true, CURRENT_TIMESTAMP),
    ('alert_provision_failed', 'provision.failed', 'admin_panel', true, CURRENT_TIMESTAMP),
    ('alert_abnormal_usage', 'billing.abnormal_usage', 'admin_panel', true, CURRENT_TIMESTAMP),
    ('alert_critical_admin_action', 'admin.critical_action', 'admin_panel', true, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
