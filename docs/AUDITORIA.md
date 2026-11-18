# Auditoría unificada (Fase 6, frente B)

Fecha: 18 nov 2026. Código: `lib/audit-log.ts`. Panel:
`/admin/auditoria` (API `app/api/admin/audit-log/route.ts`). Modelo
`AuditLog` en la migración
`prisma/migrations/20261118080000_fraud_audit_alerts/migration.sql`.

## Qué es

Un solo diario (`AuditLog`) que reúne lo que hoy escriben `AdminAudit`
y `CommerceEvent`. **Esas dos tablas se conservan**: sus escritores
siguen escribiendo donde siempre y escriben **también** en `AuditLog`
(doble escritura, mejor esfuerzo). Nada de lo viejo se borra ni se deja
de escribir, y si la escritura en `AuditLog` falla, el flujo que la
llamó sigue igual: `writeAuditLog` y `writeAuditLogTx` nunca lanzan.

Cada fila guarda: tipo de actor (`admin` / `client` / `system`),
identificador del actor, acción, tipo e id del recurso, hash de la IP,
user-agent y detalle saneado.

## Privacidad

- La IP **nunca se guarda en claro**: solo su SHA-256 (`ipHash`).
  `writeAuditLog` recibe la IP en claro, la hashea y la descarta.
- `details` pasa siempre por `sanitizeAudit` (`lib/audit-sanitize.ts`):
  nunca contraseñas, tokens, hashes, secretos ni URLs con credenciales.
  En la doble escritura de eventos antiguos, el actor se clasifica con
  `actorTypeFor`: `billing-cron` / `domain-cron` / `stripe` / `paypal`
  → `system`; un actor con `@` (correo de admin) → `admin`; cualquier
  otro identificador → `client`.
- Campos nuevos en la allowlist de `lib/audit-sanitize.ts` para este
  frente: `service`, `subscription`, `severity`, `ruleKey`. Son
  identificadores internos de recurso, no datos sensibles.

## Doble escritura: qué se re-cableó

Todos los sitios que hoy escriben `AdminAudit` o `CommerceEvent`
escriben también en `AuditLog` (misma acción, mismo recurso):

- `lib/auth.ts` (`authz.denied`), `lib/writes.ts` (ajustes del sitio,
  contenido de página, catálogo), `lib/plugins.ts`, `lib/whm.ts`,
  `lib/whmcs.ts`, `lib/billing-settings.ts`,
  `app/api/admin/site-settings/route.ts` (`authz.denied`),
  `app/api/admin/users/route.ts` (eventos de usuarios).
- `lib/commerce.ts` (pedido creado, pago confirmado, pago reembolsado,
  estado y panel del servicio, factura anulada, ticket cerrado/reabierto,
  fallo de registro de dominio), `lib/domains.ts` (pedido de dominio,
  auto-renovación pagada), `lib/billing-recurring.ts` (renovación
  creada), `lib/billing-cron.ts` (todos los eventos del cron, vía
  `auditEvent`), `lib/whm-provision.ts` (alta creada, alta fallida,
  cambio de configuración de alta), `app/api/stripe/webhook/route.ts`
  (reembolso de Stripe).

Dentro de una transacción, la fila de `AuditLog` se escribe con el
mismo cliente transaccional (`writeAuditLogTx`), así que ambas se
confirman o se revierten juntas. Fuera de una transacción, se escribe
con `writeAuditLog` (mejor esfuerzo, tras la escritura original).

## Panel y API

`/admin/auditoria` (permiso `audit:view`, 50 por página): filtros por
actor (admin/cliente/sistema), acción (contiene), recurso (contiene en
tipo o id) y rango de fechas (`from`/`to`, `YYYY-MM-DD`; `to` cubre
hasta el final del día). Los mismos filtros los acepta
`GET /api/admin/audit-log` (JSON `{ entries, total, page, pages }`,
mismo permiso). Valores inválidos se ignoran, nunca rompen la consulta
(ver `buildAuditLogWhere` en `lib/audit-log.ts`).

La auditoría antigua sigue en `/admin/actividad` (lee `AdminAudit` y
`CommerceEvent`); `/admin/auditoria` es el diario unificado nuevo.

## Retención

**Propuesta: 1 año. Decisión del dueño, pendiente.** No hay borrado
automático implementado: hoy las filas se acumulan. Cuando el dueño
decida la retención, hay que implementar el borrado (o archivado) por
fecha y documentar que la auditoría no se puede editar desde el panel.

## Qué queda pendiente del dueño

- Decidir la retención (propuesta: 1 año) y si las alertas siguen la
  misma retención.
- Sin SMTP configurado no sale ningún correo de alerta (ver
  `docs/ALERTAS.md`): las alertas solo viven en `/admin/alertas`.
