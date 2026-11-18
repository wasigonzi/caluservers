# Alertas (Fase 6, frente B)

Fecha: 18 nov 2026. Código: `lib/alerts.ts`. Panel: `/admin/alertas`
(API `app/api/admin/alerts/route.ts`). Reglas sembradas en la migración
`prisma/migrations/20261118080000_fraud_audit_alerts/migration.sql`.

## Cómo funciona

`raiseAlert({ ruleKey, severity, title, body, resourceType, resourceId })`
crea una fila en `Alert` **solo si** la `AlertRule` con esa `ruleKey` existe
y está activa. Sin regla o con la regla inactiva, no hace nada (el
resultado lo dice: `no-rule` / `rule-inactive`). Ninguna función de este
módulo lanza nunca: si la base o el correo fallan, el flujo que disparó
la alerta sigue igual.

El título y el cuerpo pasan por `sanitizeAudit` **antes** de guardarse y
de enviarse: una alerta nunca lleva contraseñas, tokens, IPs en claro ni
secretos. Las IPs solo se comparan como hash SHA-256 (ver login
sospechoso) y nunca se guardan en el texto de una alerta.

## Correo: solo con SMTP

El correo solo sale si `mailerConfigured()` es cierto (hay `SMTP_URL`).
Sin SMTP la alerta vive **solo en el panel**: no se inventa ningún envío
y el resultado lo refleja (`emailed: false`). El destinatario es
`ADMIN_EMAIL`. **Sin SMTP configurado no sale ningún correo de alerta**
(tampoco de restablecimiento; ver `lib/mailer.ts`).

## Disparadores

| Regla (`ruleKey`) | Severidad | Dónde se engancha |
| --- | --- | --- |
| `admin.login_suspicious` | warning | `app/api/admin/login/route.ts`, tras verificar contraseña y MFA y **antes** de crear la sesión. Solo si hay historial previo de `ipHash` en `AdminSession` para ese admin y la IP actual (hasheada) es distinta a todas las conocidas. Sin historial no se alerta. Sin geolocalización: solo comparación de hashes. La IP `local` (sin cabecera de IP real) no se compara. Para el fallback por entorno (sin `AdminUser`), el historial son las sesiones con `adminUserId` null. |
| `admin.password_changed` | warning | `app/api/admin/users/route.ts`, acción `change-password`: el admin cambia su propia contraseña (sesión + contraseña actual como reautenticación). No hay formulario en `/admin/seguridad` todavía: esta acción es la API que ese formulario usará. La contraseña del fallback por entorno no se cambia desde el panel (no hay `AdminUser` en BD); devuelve 409 honesto. |
| `provision.failed` | warning | `lib/whm-provision.ts`, en los dos puntos que ya registran el fallo: el `catch` del alta WHM (`provisionService`) y el del alta en otro panel (`provisionViaPanel`), junto al evento `service.provision_failed`. El servicio queda en `pending_provision` con el motivo en `provisionError`, como antes. |
| `billing.abnormal_usage` | warning | `lib/billing-cron.ts`, en `runBillingCron` tras un cobro de renovación que queda pendiente (`settleRenewalInvoice` devuelve `"pending"`). Consumo anormal = **3 o más** facturas de renovación vencidas sin cobrar seguidas (las 3 más recientes de la suscripción están en `issued` y vencidas; `ABNORMAL_USAGE_FAILED_INVOICES = 3` en `lib/alerts.ts`). Dedupe de **24 h por servicio**: no se repite la misma alerta cada día para el mismo servicio. |
| `admin.critical_action` | warning / critical | `app/api/admin/commerce/route.ts`: confirmar pago manual → **warning**; reembolsar (Stripe o manual) → **critical**; terminar servicio en el panel → **critical** y solo cuando el panel la aceptó (`terminated: true`). |

## Panel

`/admin/alertas` (permiso `audit:view`): lista con filtro por leída/no
leída y por severidad, acción marcar como leída y marcar todas como
leídas. El menú muestra el contador de alertas sin leer junto a
«Alertas» (lo lee `components/admin/AdminShell.tsx` de
`GET /api/admin/alerts?unread=1`, solo con permiso `audit:view`; si la
lectura falla, el contador queda en 0 y el enlace sigue ahí).

## Qué decide el dueño

- Activar o desactivar cada regla (`AlertRule.active`): una regla
  inactiva silencia su disparador sin tocar código.
- El destinatario del correo de alertas es hoy `ADMIN_EMAIL`; si quiere
  que llegue a otro correo, hay que hacerlo configurable.
- La retención de alertas no está definida: se propone la misma que la
  auditoría (1 año, ver `docs/AUDITORIA.md`).
