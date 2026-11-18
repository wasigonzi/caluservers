-- Fase 5 (frente B): contenido editable, base de conocimientos, idioma y
-- diseño del portal por cliente.
--
-- Modelos nuevos: ContentItem, ContentSection, KbArticle (ver
-- prisma/schema.prisma). ContentItem NO reutiliza PageContent: PageContent
-- es un CMS de campos fijos por ruta, sin idioma, sin orden y sin flag de
-- publicado; aquí hacen falta listas ordenables por tipo e idioma.
-- Aditiva: solo añade tablas y tres columnas a "user" (locale, portalTheme,
-- portalDensity), con valores por defecto; no toca ninguna tabla existente
-- ni borra datos.
-- Semilla: permisos content:write (ya existía) y kb:write para owner y
-- admin; 4 artículos genéricos de la KB publicados (es/en, redactados
-- desde los hechos del repo — el dueño debe revisarlos y completarlos);
-- secciones de contenido visibles pero VACÍAS (no se muestran hasta que
-- haya ítems publicados) y 4 ítems de EJEMPLO desactivados
-- (published=false, ningún testimonio/socio/proyecto real).

CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fieldsJson" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentItem_kind_slug_locale_key" ON "ContentItem"("kind", "slug", "locale");
CREATE INDEX "ContentItem_kind_locale_published_order_idx" ON "ContentItem"("kind", "locale", "published", "order");

CREATE TABLE "ContentSection" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentSection_key_locale_key" ON "ContentSection"("key", "locale");
CREATE INDEX "ContentSection_key_locale_idx" ON "ContentSection"("key", "locale");

CREATE TABLE "KbArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KbArticle_slug_locale_key" ON "KbArticle"("slug", "locale");
CREATE INDEX "KbArticle_locale_category_published_order_idx" ON "KbArticle"("locale", "category", "published", "order");

-- Preferencias del cliente: idioma, diseño y densidad del portal.
ALTER TABLE "user" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'es';
ALTER TABLE "user" ADD COLUMN "portalTheme" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "user" ADD COLUMN "portalDensity" TEXT NOT NULL DEFAULT 'comfortable';

-- Permiso de la base de conocimientos. content:write ya existe desde la
-- migración 20261118010000_admin_identity_rbac; se reinsertan ambos con
-- ON CONFLICT DO NOTHING para que la semilla sea idempotente.
INSERT INTO "Permission" ("id", "key", "description") VALUES
    ('perm_content_write', 'content:write', 'Editar contenidos y páginas'),
    ('perm_kb_write', 'kb:write', 'Gestionar la base de conocimientos')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_owner', "id" FROM "Permission"
WHERE "key" IN ('content:write', 'kb:write')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_admin', "id" FROM "Permission"
WHERE "key" IN ('content:write', 'kb:write')
ON CONFLICT DO NOTHING;

-- Secciones de contenido (visibles pero vacías: no se muestran en el portal
-- hasta que tengan al menos un ítem publicado).
INSERT INTO "ContentSection" ("id", "key", "locale", "title", "subtitle", "visible", "updatedAt") VALUES
    ('section_testimonials_es', 'testimonials', 'es', 'Lo que dicen nuestros clientes', NULL, true, CURRENT_TIMESTAMP),
    ('section_testimonials_en', 'testimonials', 'en', 'What our customers say', NULL, true, CURRENT_TIMESTAMP),
    ('section_partners_es', 'partners', 'es', 'Socios', NULL, true, CURRENT_TIMESTAMP),
    ('section_partners_en', 'partners', 'en', 'Partners', NULL, true, CURRENT_TIMESTAMP),
    ('section_projects_es', 'projects', 'es', 'Proyectos', NULL, true, CURRENT_TIMESTAMP),
    ('section_projects_en', 'projects', 'en', 'Projects', NULL, true, CURRENT_TIMESTAMP),
    ('section_faq_es', 'faq', 'es', 'Preguntas frecuentes', NULL, true, CURRENT_TIMESTAMP),
    ('section_faq_en', 'faq', 'en', 'Frequently asked questions', NULL, true, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Ítems de EJEMPLO desactivados (published=false). No son contenido real:
-- el dueño debe borrarlos o reemplazarlos por testimonios, socios,
-- proyectos y FAQ reales antes de publicarlos.
INSERT INTO "ContentItem" ("id", "kind", "slug", "locale", "title", "body", "fieldsJson", "order", "published", "createdBy", "createdAt", "updatedAt") VALUES
    ('content_ejemplo_testimonio_es', 'testimonial', 'ejemplo-testimonio', 'es', '[Ejemplo] Cliente satisfecho', '[Ejemplo] Texto de ejemplo: reemplaza este testimonio por uno real con el permiso del cliente.', '{"author": "[Ejemplo] Nombre Apellido", "role": "[Ejemplo] Empresa"}', 0, false, 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('content_ejemplo_socio_es', 'partner', 'ejemplo-socio', 'es', '[Ejemplo] Socio', '[Ejemplo] Descripción de ejemplo de un socio. Reemplazar por un socio real.', '{"url": "https://example.com"}', 0, false, 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('content_ejemplo_proyecto_es', 'project', 'ejemplo-proyecto', 'es', '[Ejemplo] Proyecto', '[Ejemplo] Descripción de ejemplo de un proyecto. Reemplazar por un proyecto real.', '{}', 0, false, 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('content_ejemplo_faq_es', 'faq', 'ejemplo-faq', 'es', '[Ejemplo] ¿Cómo empiezo?', '[Ejemplo] Respuesta de ejemplo. Reemplazar por una pregunta frecuente real.', '{}', 0, false, 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Base de conocimientos inicial: 4 artículos genéricos publicados,
-- redactados solo desde los hechos del repo. El dueño debe revisarlos y
-- completarlos (ver informe de la Fase 5, frente B).
INSERT INTO "KbArticle" ("id", "slug", "locale", "category", "title", "body", "order", "published", "views", "createdAt", "updatedAt") VALUES
    ('kb_como_contratar_es', 'como-contratar-un-servicio', 'es', 'servicios', 'Cómo contratar un servicio', '1. Elige el plan que te convenga en Web Hosting, VPS o Servidores dedicados y pulsa «Contratar».

2. El pedido se completa en tu área de cliente: se genera el pedido con su factura.

3. Paga la factura. Mientras no se confirme el pago, la factura sigue pendiente y el servicio no se activa.

4. Cuando se confirma el pago, el servicio aparece en tu panel del cliente. Para el hosting, el dominio que declares en el pedido es el que se usa para crear tu cuenta de cPanel; la contraseña inicial de cPanel se muestra en tu panel, solo a ti: cámbiala al entrar por primera vez.

La activación puede requerir una revisión manual por parte del equipo, por lo que no se publica un plazo fijo de alta.', 0, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('kb_como_contratar_en', 'how-to-order-a-service', 'en', 'services', 'How to order a service', '1. Choose the plan that suits you under Web Hosting, VPS or Dedicated Servers and click “Order”.

2. The order is completed in your client area: the order is created together with its invoice.

3. Pay the invoice. Until the payment is confirmed, the invoice stays pending and the service is not activated.

4. Once the payment is confirmed, the service appears in your client panel. For hosting, the domain you enter in the order is used to create your cPanel account; the initial cPanel password is shown in your panel, only to you: change it the first time you log in.

Activation may require a manual review by the team, so no fixed activation time is published.', 0, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('kb_como_pagar_es', 'como-pagar-una-factura', 'es', 'facturacion', 'Cómo pagar una factura', 'Cada pedido genera una factura con el importe, la moneda y el detalle del plan. Puedes pagarla en línea con PayPal o por cobro manual, que el equipo confirma en el panel.

Mientras no se confirme el pago, la factura sigue pendiente y el servicio no se activa. Si cancelas el pago en PayPal, la factura sigue pendiente y puedes pagarla cuando quieras.

Los impuestos, si aplican, se muestran en la factura; si aún no están determinados, la factura lo indica como por determinar.

Mantén actualizados tus datos de facturación y el correo de tu cuenta.', 1, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('kb_como_pagar_en', 'how-to-pay-an-invoice', 'en', 'billing', 'How to pay an invoice', 'Each order generates an invoice with the amount, the currency and the plan details. You can pay online with PayPal or by manual payment, which the team confirms in the panel.

Until the payment is confirmed, the invoice stays pending and the service is not activated. If you cancel the PayPal payment, the invoice stays pending and you can pay it whenever you want.

Taxes, if they apply, are shown on the invoice; if they are not determined yet, the invoice says so.

Keep your billing details and your account email up to date.', 1, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('kb_renovar_dominio_es', 'como-renovar-un-dominio', 'es', 'dominios', 'Cómo renovar un dominio', 'El registro, la renovación y la transferencia de dominios se gestionan desde tu panel de cliente, junto a tus planes de hosting y VPS.

Renueva antes de la fecha de vencimiento que muestra tu panel: un dominio vencido puede dejar de resolver y su renovación posterior no está garantizada.

Las extensiones disponibles son .com, .net, .org, .online, .info y .store. El precio de renovación es el que muestra tu panel al renovar.

Si tu dominio está a punto de vencer y no ves la opción de renovar en tu panel, abre un ticket de soporte con el nombre del dominio.', 2, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('kb_renovar_dominio_en', 'how-to-renew-a-domain', 'en', 'domains', 'How to renew a domain', 'Domain registration, renewal and transfer are managed from your client panel, together with your hosting and VPS plans.

Renew before the expiry date shown in your panel: an expired domain may stop resolving, and renewing it afterwards is not guaranteed.

The available extensions are .com, .net, .org, .online, .info and .store. The renewal price is the one shown in your panel when you renew.

If your domain is about to expire and you do not see the renewal option in your panel, open a support ticket with the domain name.', 2, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('kb_recuperar_contrasena_es', 'como-recuperar-la-contrasena', 'es', 'cuenta', 'Cómo recuperar la contraseña', 'Si no puedes entrar a tu área de cliente porque olvidaste tu contraseña, el restablecimiento por correo no está activo en este momento.

Para recuperar el acceso, abre un ticket de soporte desde la página de Contacto indicando el correo de tu cuenta, o escribe a soporte@caluservers.com desde ese mismo correo. El equipo te responderá con los pasos para recuperar el acceso.

Cuando vuelvas a entrar, cambia tu contraseña desde tu perfil y no la compartas con nadie. Si sospechas que alguien entró en tu cuenta, cambia tu contraseña y abre un ticket de inmediato.', 3, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('kb_recuperar_contrasena_en', 'how-to-recover-your-password', 'en', 'account', 'How to recover your password', 'If you cannot log in to your client area because you forgot your password, password reset by email is not active at this time.

To recover access, open a support ticket from the Contact page stating your account email, or write to soporte@caluservers.com from that same email. The team will reply with the steps to recover access.

Once you are back in, change your password from your profile and do not share it with anyone. If you suspect someone entered your account, change your password and open a ticket right away.', 3, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
