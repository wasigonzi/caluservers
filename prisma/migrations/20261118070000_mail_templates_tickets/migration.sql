-- Fase 5 (frente C): plantillas de correo editables, respuestas
-- predefinidas y adjuntos de ticket.
--
-- Modelos nuevos: MailTemplate, CannedReply, TicketAttachment (ver
-- prisma/schema.prisma). MailTemplate guarda asunto y cuerpo con variables
-- {{nombre}}; una variable sin valor se renderiza vacía, nunca se muestra
-- como {{variable}}. CannedReply es el texto que el agente inserta en la
-- respuesta de un ticket. TicketAttachment guarda el archivo fuera del
-- repo (TICKET_ATTACHMENTS_DIR) con su hash SHA-256; en BD solo viven los
-- metadatos y la clave de almacenamiento.
-- Aditiva: no toca ninguna tabla existente ni borra datos.
-- Semilla: permiso mail:write para owner y admin (las respuestas
-- predefinidas usan el permiso existente tickets:reply); 4 plantillas
-- activas en español con los textos que hoy envía el código (reset de
-- contraseña y avisos de ticket); 4 respuestas predefinidas genéricas en
-- español que EL DUEÑO DEBE REVISAR antes de usarlas con clientes reales.

CREATE TABLE "MailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variablesJson" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailTemplate_key_locale_key" ON "MailTemplate"("key", "locale");
CREATE INDEX "MailTemplate_key_active_idx" ON "MailTemplate"("key", "active");

CREATE TABLE "CannedReply" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "category" TEXT NOT NULL DEFAULT 'general',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannedReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CannedReply_locale_active_order_idx" ON "CannedReply"("locale", "active", "order");

CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TicketMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TicketAttachment_storageKey_key" ON "TicketAttachment"("storageKey");
CREATE INDEX "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");
CREATE INDEX "TicketAttachment_messageId_idx" ON "TicketAttachment"("messageId");

-- Permiso de plantillas de correo. Id determinista para idempotencia.
INSERT INTO "Permission" ("id", "key", "description") VALUES
    ('perm_mail_write', 'mail:write', 'Gestionar las plantillas de correo editables')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_owner', "id" FROM "Permission"
WHERE "key" IN ('mail:write')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_admin', "id" FROM "Permission"
WHERE "key" IN ('mail:write')
ON CONFLICT DO NOTHING;

-- Plantillas en español con los textos que hoy envía el código. Si una
-- plantilla activa existe, el mailer la usa; si no, cae al texto del código.
INSERT INTO "MailTemplate" ("id", "key", "locale", "subject", "body", "variablesJson", "active", "updatedAt") VALUES
    ('tpl_password_reset_es', 'password-reset', 'es', 'Restablece tu contraseña de CaluServers',
     'Este enlace es de un solo uso y caduca.' || chr(10) || 'Si no solicitaste este mensaje, ignóralo.' || chr(10) || '{{resetUrl}}',
     '["resetUrl"]', true, CURRENT_TIMESTAMP),
    ('tpl_ticket_reply_es', 'ticket-reply', 'es', 'Respuesta a tu ticket: {{ticketSubject}}',
     'El equipo de soporte respondió a tu ticket.' || chr(10) || 'Léelo y responde aquí: {{ticketUrl}}',
     '["ticketSubject", "ticketUrl"]', true, CURRENT_TIMESTAMP),
    ('tpl_ticket_new_staff_es', 'ticket-new-staff', 'es', 'Ticket nuevo: {{ticketSubject}}',
     'Cliente: {{customerEmail}}' || chr(10) || 'Ábrelo en el panel de administración: {{ticketUrl}}',
     '["ticketSubject", "ticketUrl", "customerEmail"]', true, CURRENT_TIMESTAMP),
    ('tpl_ticket_reply_staff_es', 'ticket-reply-staff', 'es', 'Respuesta del cliente: {{ticketSubject}}',
     'Cliente: {{customerEmail}}' || chr(10) || 'Ábrelo en el panel de administración: {{ticketUrl}}',
     '["ticketSubject", "ticketUrl", "customerEmail"]', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key", "locale") DO NOTHING;

-- Respuestas predefinidas genéricas en español. Textos de partida: EL
-- DUEÑO DEBE REVISARLOS (tono, plazos y datos de contacto) antes de
-- usarlas con clientes reales.
INSERT INTO "CannedReply" ("id", "title", "body", "locale", "category", "order", "active", "updatedAt") VALUES
    ('canned_ack_es', 'Acuse de recibo',
     'Hola, gracias por escribirnos. Hemos recibido tu ticket y lo estamos revisando. Te responderemos en cuanto tengamos novedades.',
     'es', 'general', 10, true, CURRENT_TIMESTAMP),
    ('canned_more_info_es', 'Petición de más datos',
     'Hola, para ayudarte necesitamos un poco más de información: ¿podrías indicarnos los pasos para reproducir el problema y, si es posible, adjuntar una captura de pantalla?',
     'es', 'general', 20, true, CURRENT_TIMESTAMP),
    ('canned_provisioned_es', 'Confirmación de alta',
     'Hola, tu servicio ya está dado de alta. Puedes entrar en tu cuenta para ver los datos de acceso y, si algo no funciona, responde a este mismo ticket.',
     'es', 'general', 30, true, CURRENT_TIMESTAMP),
    ('canned_close_es', 'Cierre del ticket',
     'Hola, damos este ticket por resuelto. Si vuelve a ocurrir, responde a este mismo ticket y lo reabrimos. Gracias por confiar en CaluServers.',
     'es', 'general', 40, true, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
