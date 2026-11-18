# CaluServers hacia WHMCS completo — Entrega de la rama `feat/whmcs-full`

Fecha de cierre: 18 nov 2026. Base: `main` `2409921d` (PR #35 mergeado).
Rama: `feat/whmcs-full`, en `~/workspace/caluservers-whmcs`.
**Sin push, deploy ni merge. Nada verificado en vivo: sin despliegue, sin BD real,
sin navegador, sin cuentas ni pagos reales.**

## Estado final verificado por el coordinador (18 nov 2026)

- `npx tsc --noEmit`: **exit 0**
- `npm test` (sin `DATABASE_URL`): **606 tests, 602 pass, 0 fail, 4 skipped**
  (los 4 son las suites de integración con BD, preexistentes)
- `prisma validate` (con `DATABASE_URL` ficticia, solo para validar): **esquema válido**
- Diff total de la rama: **75 archivos rastreados, +5102/−547** (más archivos nuevos
  sin commitear). Esquema: **52 modelos**. E2E con stub WHM **no se pudo correr
  en esta VM** (no hay binarios de PostgreSQL, `pg_dump` ni `age` instalados).

## Qué se hizo por fase

### Fase 0 — Endurecimiento sin romper
- `ADMIN_MFA_REQUIRED` (bloqueo de login sin MFA enrolado).
- Cabeceras de seguridad en `next.config.mjs` (HSTS, nosniff, Referrer-Policy,
  Permissions-Policy, COOP; CSP estricta en modo informe, `unsafe-inline` se
  mantiene porque Next.js App Router lo necesita).
- `lib/audit-sanitize.ts`: sanitizador con allowlist aplicado en los 18 sitios
  que escriben `AdminAudit`/`CommerceEvent`.
- Revisión de autorización por recurso en rutas de cliente: sin hallazgos P0.
  El registro sí enumera (`signUp` devuelve "User already exists"); anotado,
  sin tocar.

### Fase 1 — Identidad y RBAC
- Migraciones `20261118010000_admin_identity_rbac` y
  `20261118020000_webauthn_challenges`.
- `AdminUser`, `AdminSession` (token SHA-256, revocable, `stepUpAt`),
  `PasskeyCredential`, `RecoveryCode`, `Role`, `Permission`, `RolePermission`,
  `AdminUserRole`. Roles owner/admin/soporte; el cliente no es rol de admin.
- Argon2id (OWASP 19 MiB/t2/p1) con verificación dual scrypt→Argon2id y
  rehash al login; `scripts/admin-migrate.mjs` para el propietario (fallback
  por entorno solo 7 días, con aviso); `scripts/hash-password.mjs` a Argon2id.
- Passkeys (better-auth para clientes, `@simplewebauthn/*` para admin), TOTP
  ±1, códigos de recuperación de un solo uso.
- `requirePermission` por ruta admin; sin permiso → 403 + `authz.denied`;
  cliente con id ajeno → 404. Menú que oculta secciones sin permiso.
- `/admin/apariencia` separada de `/admin/site`; `/admin/usuarios`
  (protege el último owner y el auto-bloqueo); `/admin/seguridad` y
  `/cuenta/seguridad`.
- Permisos del owner al final de esta fase: 18 (hoy 24, ver Fase 6).

### Fase 2 — Plugins, Stripe y facturación recurrente
- Migración `20261118030000_plugins_billing`.
- Registro de plugins en BD (`Plugin`, secretos AES-256-GCM, `/admin/plugins`);
  contratos `PaymentGateway`, `DomainRegistrar`, `ControlPanel`; plugin
  desactivado o sin credenciales → 503 honesto.
- Stripe (SDK oficial): Checkout por factura + Billing, webhook con firma
  verificada, `recordGatewayPayment` generalizado con `providerRef` único.
  PayPal intacto. Transferencia bancaria como pasarela.
- `Subscription`, `Credit`, `PromoCode`, `BillingRun`, `TaxRule`; cron diario
  `/api/cron/billing` y `/api/cron/renewals` (CRON_SECRET, idempotencia por
  suscripción+periodo, lotes de 50); recordatorios 7/3/1 días; dunning
  (día 1 aviso, 3 y 7 reintento, 14 suspensión, 30 terminación **solo** con
  `DUNNING_TERMINATE_ENABLED=true`, por defecto `false`); reembolsos auditados.
- Hueco encontrado y corregido en Fase 3: `gatewaySubscriptionId` ahora se
  fija al confirmar el primer pago con Stripe (4 ciclos).

### Fase 3 — Dominios con Porkbun
- Migración `20261118040000_domains_porkbun`.
- `TldPrice` + `RegisteredDomain`; plugin registrador Porkbun (API v3
  verificada en docs oficiales: check/create/renew/transfer/get/listAll/
  nameservers; sandbox existe pero sin credenciales no se usó).
- Pedido → factura (precio congelado) → pago → registro; fallo → `pending`
  con motivo visible y reintento manual. Transferencia con código EPP cifrado.
  Renovación con avisos 30/14/7/1 días y auto-renew solo con crédito.
  Cron `/api/cron/domains` 08:00 UTC (precios + avisos + auto-renew).
- `.pr` como registro asistido (sin API pública). GoDaddy solo manifiesto.
- Sin verificar: formato exacto de `domain/get` y `getNs`, precio de
  transferencia y `updateNs` (a confirmar en sandbox). `setAutoRenew` no
  tiene endpoint en Porkbun (flag local). Código EPP de salida no existe
  por API (501 honesto).

### Fase 4 — Plesk + DirectAdmin + terminate/unsuspend WHM
- Migración `20261118050000_service_panels`.
- `terminateacct`/`unsuspendacct` WHM (fallo en cancelar no deshace la
  cancelación; cancelar marca la `Subscription` como `cancelled`); permiso
  nuevo `services:terminate`; panel por servicio (`CustomerService.panelKey`,
  `panelByPlan`); dunning día 14/30 usa el panel del servicio.
- Plugins Plesk (API-RPC 1.6.7.0, verificado en docs oficiales) y DirectAdmin
  (CMD_API_ACCOUNT_USER/SELECT_USERS/SHOW_USER_CONFIG, verificado), doble
  cerrojo (env + plugin activo + secretos) y prueba de conexión solo lectura.
  `docs/PANELES.md`.
- Hueco encontrado y corregido en Fase 5: `provisionService` ya da de alta
  por adaptador (WHM/Plesk/DirectAdmin) con el mismo patrón de fallo/reintento.
- Sin verificar: status `customer` SET en Plesk, REST v2, paquete 1.6.7.0 en
  Obsidian 18.0.82, éxito exacto de `CMD_API_SELECT_USERS`. `changePackage`
  en DirectAdmin → 501 honesto.

### Fase 5 — Contenido, KB, i18n y 3 diseños de portal
- Migraciones `20261118060000_content_kb` y `20261118070000_mail_templates_tickets`.
- `ContentItem`, `ContentSection`, `KbArticle`; `/admin/contenido`,
  `/admin/kb`, `/kb` pública con búsqueda; secciones vacías o sin publicar
  no se muestran. `PageContent` no se reutilizó (sin idioma/orden/publicado).
- i18n ES/EN (`lib/i18n/`, cookie `calu-locale`, caída a español; aviso de
  falta de traducción solo en admin). Legales solo en español, con aviso.
- 3 diseños de portal reutilizando presets `default/ocean/midnight` +
  densidad comfortable/compact/relaxed; elección guardada por cliente.
  i18n parcial: portal principal, navegación pública y KB; admin y vistas
  profundas del portal quedan en español por ahora.
- `MailTemplate` (mailer lee BD, cae a textos actuales; variables sin valor
  quedan vacías, nunca `{{variable}}`); `CannedReply`; `TicketAttachment`
  (10 MB, imágenes/PDF/TXT/ZIP, solo si `TICKET_ATTACHMENTS_DIR` configurada).
- Sembrado: 8 artículos KB genéricos ES/EN + 4 ítems `[Ejemplo]` desactivados
  + 4 plantillas ES + 4 predefinidas ES. **El dueño debe revisar los textos
  y borrar los ejemplos antes de publicar nada real.**

### Fase 6 — Fraude, informes, alertas, respaldos e infra
- Migración `20261118080000_fraud_audit_alerts` (`FraudRule`, `FraudFlag`,
  `AuditLog`, `AlertRule`, `Alert`; permiso nuevo `reports:view`, owner 24
  permisos).
- **Fraude** (`lib/fraud.ts`, `/admin/fraude`, `docs/FRAUDE.md`): 4 reglas
  activas solo en modo `flag` (velocidad 3 pedidos/1h, importe > $500,
  dominio desechable, IP con > 3 cuentas). Evaluación tras crear el pedido
  y antes de cobrar; si marca, queda en revisión y el admin aprueba o
  rechaza. El pago **no** se bloquea por defecto. MaxMind: solo esqueleto
  documentado, NO activo. **Hueco honesto:** la regla de IP hoy no puede
  marcar — ningún llamador pasa `ipHash` a `createCustomerOrder` y la regla
  busca el hash en `AuditLog.ipHash`; falta cablear la IP del checkout.
- **Informes** (`lib/reports.ts`, `/admin/informes`, `docs` en el informe):
  antigüedad 0-30/31-60/61-90/90+ días, ingresos por mes (12 meses) y por
  producto, suscripciones por estado, dominios por expirar (30 días),
  exportación CSV (`reports:view`). Números de la BD real; sin datos, ceros.
- **Auditoría unificada** (`lib/audit-log.ts`, `/admin/auditoria`,
  `docs/AUDITORIA.md`): `AuditLog` con IP hasheada (SHA-256) y `details`
  por `sanitizeAudit`; los escritores existentes escriben TAMBIÉN aquí
  (AdminAudit y CommerceEvent se conservan). Filtros por actor, acción,
  recurso y fecha; 50 por página.
- **Alertas** (`lib/alerts.ts`, `/admin/alertas`, `docs/ALERTAS.md`):
  login de admin sospechoso (solo con historial previo de `ipHash`, sin
  geolocalización), cambio de contraseña de admin, fallo de
  aprovisionamiento, consumo anormal (3+ facturas fallidas seguidas, dedupe
  24 h), acciones críticas (confirmar pago, reembolsar, terminar servicio).
  Correo solo con SMTP (destinatario `ADMIN_EMAIL`); sin SMTP solo en panel.
  Indicador de sin leer en el menú del admin.
- **Rotación** (`scripts/rotate-secrets.mjs`, `docs/SEGURIDAD-RBAC.md`):
  `--dry-run` por defecto (lista sin valores, verifica descifrado);
  `--apply` re-cifra secretos de plugins con la clave nueva; `AUTH_SECRET`
  se cambia a mano en Vercel. El script nunca se ejecutó con `--apply`.
- **Respaldos** (`scripts/backup.mjs`, `scripts/restore.mjs`,
  `docs/RESPALDOS.md`): `pg_dump` + cifrado `age` (si hay clave pública y
  `age` instalado; si no, guarda sin cifrar con aviso, sin fingir cifrado)
  + subida S3-compatible solo con las 4 variables (firma SigV4 a mano).
  `restore --dry-run` verifica sin tocar ninguna BD; `--target-db` exige
  `--confirm`. Nada subido ni restaurado (sin credenciales ni binarios).
- **Infra** (`docs/INFRA.md`): solo guía (Cloudflare Access/VPN para
  `/admin`, WAF, API privada con mTLS). Nada implementado.
- **Step-up** (`lib/stepup.ts`, `POST /api/admin/step-up`): operaciones
  peligrosas (terminar servicio, reembolsar, crear admin) exigen
  reautenticación reciente (15 min; el plan decía 10, documentado el
  motivo) con contraseña + TOTP si lo hay. Sin step-up → 403
  `step-up-required`. **Hueco:** no existe acción de asignar/quitar roles
  (solo `create` con rol); `disable`/`enable` no exigen step-up hoy.

## Migraciones en orden (aplicar con `prisma migrate deploy`)

1. `20261118010000_admin_identity_rbac`
2. `20261118020000_webauthn_challenges`
3. `20261118030000_plugins_billing`
4. `20261118040000_domains_porkbun`
5. `20261118050000_service_panels`
6. `20261118060000_content_kb`
7. `20261118070000_mail_templates_tickets`
8. `20261118080000_fraud_audit_alerts`

Las migraciones anteriores a la Fase 0 ya están en `main` (PR #35).

## Procedimiento de despliegue (paso a paso)

1. **Revisar la rama** `feat/whmcs-full` y mergear a `main` solo cuando el
   dueño lo apruebe (nada está mergeado).
2. **Variables en Vercel** (todas sin valores en `.env.example`): `PAYPAL_*`,
   `SMTP_URL` + `MAIL_FROM`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET` (`openssl rand -hex 32`),
   `AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD_HASH` (solo hasta migrar), `WEBAUTHN_RP_ID` /
   `BETTER_AUTH_URL` (dominio definitivo), `DUNNING_TERMINATE_ENABLED`
   (false por defecto), `PLESK_ENABLED` / `DIRECTADMIN_ENABLED` (false por
   defecto), `TICKET_ATTACHMENTS_DIR`, `BACKUP_AGE_PUBLIC_KEY` (+ resto
   `BACKUP_S3_*` si hay bucket).
3. **Aplicar migraciones en producción**: `npx prisma migrate deploy`
   (las 8 de arriba, en orden). Después, reseed del catálogo y de las filas
   viejas de `PageContent` de términos/privacidad (pendiente desde el PR #35).
4. **Migrar al admin propietario**: `node scripts/admin-migrate.mjs` con
   las variables de despliegue (crea el `AdminUser` owner). Sin esto, el
   primer login usa el fallback por entorno.
5. **Activar `ADMIN_MFA_REQUIRED=true`** en Vercel.
6. **Avisar a los admins**: todos entran de nuevo (las cookies HMAC viejas
   caducan) y deben enrolar MFA/passkey.
7. **Configurar en el admin**: plugins Stripe/PayPal/bank_transfer/Porkbun/
   WHM/Plesk/DirectAdmin en `/admin/plugins` (credenciales cifradas en BD);
   webhook de Stripe a `https://TU-DOMINIO/api/stripe/webhook` con los 6
   eventos; `TldPrice` activas; `panelByPlan` por plan; plantillas de correo
   y textos KB/contenido revisados.
8. **Probar antes de abrir la venta**: cobro real en modo test de Stripe;
   dominio barato real en sandbox de Porkbun (procedimiento en
   `docs/DOMINIOS.md`); primera prueba real de Plesk/DirectAdmin
   (`docs/PANELES.md`); restauración de un backup en una BD de pruebas
   (`docs/RESPALDOS.md`).
9. **Programar el respaldo**: hoy `scripts/backup.mjs` es manual; sin
   programarlo (cron externo o tarea) no hay respaldo automático.

## Pendientes del dueño (no se puede cerrar sin él)

- **Cuentas y claves**: Stripe (test primero, luego live) + webhook;
  Porkbun con saldo + API key/secret; PayPal; SMTP + `MAIL_FROM`;
  token WHM de escritura con ACL `createacct` + `suspendacct` +
  `unsuspendacct` + `terminateacct`; servidores Plesk/DirectAdmin con
  credenciales y mapeo de paquetes; clave age pública/privada y bucket S3.
- **Decisiones**: impuestos/IVU (sin decisión sigue `TAX_MODE=none`);
  titular legal; dominio definitivo; MaxMind sí/no; retención de auditoría
  (propuesto 1 año) y de backups (30 días + 12 meses); restauración probada
  trimestral; frecuencia diaria de respaldos; política de terminación WHM
  y de reembolsos; caducidad step-up 15 min (o bajar a 10); si
  `disable`/`enable` de admins exige step-up; TLD iniciales y precios de
  venta de dominios; qué productos van en cada panel.
- **Contenido real ES/EN**: testimonios, socios, proyectos, FAQ y KB
  (revisar los 8 artículos genéricos y las 4 predefinidas; borrar los 4
  ítems `[Ejemplo]`); plantillas de correo en inglés (hoy solo ES).
- **Tras el merge**: aplicar las 8 migraciones, correr
  `scripts/admin-migrate.mjs`, activar `ADMIN_MFA_REQUIRED`, avisar a los
  admins del re-login. Vercel Pro si el cron debe ser más que diario.

## Documentación entregada

`docs/SEGURIDAD-RBAC.md`, `docs/PLUGINS.md`, `docs/DOMINIOS.md`,
`docs/PANELES.md`, `docs/FRAUDE.md`, `docs/ALERTAS.md`, `docs/AUDITORIA.md`,
`docs/RESPALDOS.md`, `docs/INFRA.md`, `docs/WHMCS-ENTREGA.md` (este archivo),
además de las docs previas (`docs/CREDENCIALES-PENDIENTES.md`,
`docs/PROVISION_WHM.md`, etc.) y el plan en
`~/workspace/caluservers-whmcs-plan/PLAN.md`.
