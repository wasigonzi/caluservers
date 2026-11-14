# Pedidos y aprovisionamiento automático

Cuando un cliente hace un pedido en la web, la cuenta de hosting se crea
sola al confirmarse el pago. Nada de crear cuentas a mano en WHM.

## Flujo

```
Cliente pide (checkout)          Admin o webhook confirma el pago
  /checkout?plan=wh1                /api/admin/orders/[id]/confirm-payment
  POST /api/orders                   /api/webhooks/payment (HMAC)
        |                                    |
        v                                    v
  Pedido: pending_payment  ----->  paid  ----->  provisioning  ----->  active
                                     |                |
                                     |                +--> provision_failed
                                     |                      (error visible,
                                     |                       Reintentar)
                                     |
                              Sin pago confirmado
                              NO se crea nada en WHM
```

Estados del pedido (`Order.status`):

| Estado | Significado |
|---|---|
| `pending_payment` | Pedido creado, esperando pago. Sin cuenta WHM. |
| `paid` | Pago confirmado, aprovisionamiento en curso o por empezar. |
| `provisioning` | Creando la cuenta cPanel en WHM (transitorio). |
| `active` | Cuenta creada y vinculada (`HostingAccount`). |
| `provision_failed` | WHM falló. El error queda guardado y visible; Reintentar. |
| `cancelled` | Reservado (sin uso por ahora). |

## Qué se aprovisiona

Solo planes de **hosting web** (cPanel, `createacct`). Los botones
"Ordenar →" de los planes web llevan al checkout propio
(`/checkout?plan=<id>`); VPS y dedicados conservan su compra externa
porque no existe API de aprovisionamiento para ellos en este proyecto.

- Usuario cPanel: derivado del dominio (minúsculas, `^[a-z][a-z0-9_]{0,15}$`,
  sin empezar por `test`). Si ya existe, se usa un sufijo determinista.
- Contraseña: generada en el servidor (20 caracteres, 4 clases), derivada
  de forma determinista por pedido+usuario, guardada **cifrada**
  (AES-256-GCM, `SETTINGS_ENCRYPTION_KEY`). Solo el admin la ve.
- Paquete WHM: por defecto el nombre del plan; se puede sobreescribir por
  plan en el ajuste `whm_package_map` (JSON `{planId: packageName}` en
  `SiteSetting`). El paquete debe existir en WHM o el aprovisionamiento
  falla con error visible.

## Confirmar el pago

### 1. Manual (admin) — funciona hoy, sin proveedor

En `/admin/orders`, botón **Confirmar pago** (doble clic de confirmación)
en un pedido pendiente. También existe `POST
/api/admin/orders/[id]/confirm-payment` (solo admin + mismo origen).

### 2. Webhook — listo para conectar un proveedor

`POST /api/webhooks/payment`, sin proveedor conectado todavía.

- Header: `x-caluservers-signature: sha256=<hmac hex del cuerpo crudo
  con PAYMENT_WEBHOOK_SECRET>`.
- Cuerpo JSON: `{ "orderNumber": "CS-XXXXXXXX", "paymentRef": "…",
  "status": "paid" }` (`"completed"` también se acepta).
- Sin `PAYMENT_WEBHOOK_SECRET` el webhook responde 503 (desactivado).
- Idempotente: un pago ya confirmado responde 200 sin re-aprovisionar.
- Si el aprovisionamiento falla se responde 200 con
  `status: "provision_failed"` (el error queda en el pedido; el admin
  reintenta desde la web) para que el proveedor no reintente en bucle.

Para conectarlo: el proveedor debe poder enviar ese webhook (o un
adaptador que traduzca su formato a este). No hay proveedor cableado.

## Idempotencia y fallos

- Confirmar el mismo pago dos veces (doble clic, webhook duplicado) solo
  aprovisiona una vez: la reclamación de estado es atómica (`updateMany`
  condicional) y `Order.whmUsername` / `HostingAccount.orderId` son únicos.
- Si WHM responde "incierto" (la cuenta pudo crearse pero la respuesta se
  perdió), el reintento **readopta** la cuenta existente con el mismo
  dominio en lugar de duplicarla (la contraseña es determinista por
  pedido+usuario).
- Si WHM rechaza (paquete inexistente, credenciales, red), el pedido queda
  en `provision_failed` con el mensaje de error guardado. Nunca se traga
  el error en silencio. El admin ve el error y el botón **Reintentar**.
- El cliente ve su pedido en `/pedido/<token>` (enlace de seguimiento
  único por pedido, sin login): estado, plan, dominio, usuario y paquete
  cuando está activo, y enlace a cPanel. La contraseña NO se muestra al
  cliente; el admin la copia desde `/admin/orders` y se la comparte.

## Qué falta para que funcione en vivo

1. **Base de datos**: `DATABASE_URL` (y `DIRECT_URL`) en Vercel y
   `npx prisma migrate deploy` (la migración
   `prisma/migrations/20261113200000_orders_provisioning` crea `Order` y
   `HostingAccount`). Sin esto, el checkout responde 502.
2. **WHM real**: servidor, usuario y token en `/admin/settings`
   (cifrados con `SETTINGS_ENCRYPTION_KEY`). El token necesita ACL para
   `createacct`, `listaccts` y `listpkgs` (y `suspendacct` /
   `unsuspendacct` / `changepackage` para gestionar después). Sin esto,
   el aprovisionamiento falla con "Pendiente configuración".
3. **Paquetes WHM**: los paquetes de WHM deben existir con los nombres
   que usa el mapa (por defecto, el nombre del plan: "Calu Starter",
   "Calu Professional", "Calu Business") o ajustarse en `whm_package_map`.
4. **Proveedor de pago** (opcional, para confirmación 100% automática):
   `PAYMENT_WEBHOOK_SECRET` en Vercel + webhook del proveedor apuntando
   a `/api/webhooks/payment` con el contrato de arriba. Sin proveedor,
   la confirmación manual del admin es la vía activa.
5. **Merge de PR #11** (rama `whm-mgmt`): el aprovisionamiento usa
   `manageWhm`/`writeWhm` de esa rama. Sin ella no hay `createacct`.

## Verificación end-to-end (local, sin WHM real)

`scripts/e2e-provisioning.mjs` + `scripts/stub-whm-server.mjs`:

- Levanta un stub WHM local que registra cada `createacct` (método,
  parámetros) y responde como WHM (éxito o error configurable).
- Contra el servidor Next real y una base local: checkout real, webhook
  real con HMAC, confirmación del admin real, y aprovisionamiento real
  contra el stub. Comprueba estados, idempotencia, fallo y reintento.
- Lo que NO cubre: la capa TLS/DNS del transporte WHM real (por diseño
  solo acepta IPs públicas con certificado válido; no se puede apuntar a
  localhost) ni un proveedor de pago real ni la base de producción.
  Esos pasos se verifican al conectar WHM y el proveedor reales.
