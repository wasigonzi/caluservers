# Dominios con Porkbun (Fase 3)

Venta y gestión de dominios con Porkbun como registrador. La disponibilidad
la decide RDAP (ver `docs/DOMINIOS_RDAP.md`); Porkbun solo aporta precios y
ejecuta registros, renovaciones y transferencias.

## Piezas

| Pieza | Qué hace |
|---|---|
| `prisma/schema.prisma` | `TldPrice` (precio de venta por TLD y registrador) y `RegisteredDomain` (dominio del cliente, estado, vencimiento, flag local de auto-renew, código EPP cifrado) |
| `lib/porkbun.ts` | Adaptador de la API JSON v3 de Porkbun (`DomainRegistrar`) |
| `lib/domains.ts` | Servicio sin rutas HTTP: precios, pedidos, post-pago, reintentos, recordatorios y auto-renew con crédito |
| `lib/plugins.ts` | Manifiestos `porkbun` (adaptador real) y `godaddy` (solo manifiesto) |
| `lib/auth.ts` | Permisos `domains:view` y `domains:write` (owner y admin) |

## Endpoints de Porkbun verificados

Fuente: documentación oficial v3.100, <https://porkbun.com/api/json/v3/documentation>
y <https://porkbun.com/llms-full.txt>. Base: `https://api.porkbun.com/api/json/v3`.
Auth por cabeceras `X-API-Key` / `X-Secret-API-Key` (preferido). Respuestas
con `status` SUCCESS/ERROR y `code`. Límite: 1 intento por segundo y un
pedido de 100 $ como máximo. Las escrituras llevan `Idempotency-Key`.

| Operación | Llamada | Notas |
|---|---|---|
| Precios | `POST /pricing/get` (sin auth), body `{tlds:[...]}` | Respuesta `{pricing:{com:{registration,renewal,transfer}}}` en USD texto; TLD no vendido sale en `unsupported`. Los TLD se envían sin punto (`com`) |
| Disponibilidad + precio | `POST /domain/checkDomain/{domain}` | Respuesta `avail` yes/no, `price`, `additional.renewal.price` y precio de transferencia. Premium con precio propio |
| Disponibilidad (lote) | `POST /domain/checkDomain` con `{domains:[...]}` | Hasta 25 dominios (no usado por el adaptador, que consulta de uno en uno) |
| Registro | `POST /domain/create/{domain}` `{cost, agreeToTerms:"yes"}` | `cost` en pennies, EXACTO al precio de `checkDomain`. Duración mínima (normalmente 1 año). Premium NO registrable por API. Respuesta `{status, domain, cost, orderId, balance}` |
| Renovación | `POST /domain/renew/{domain}` `{cost}` | `cost` = precio de renovación (`checkDomain` con `priceType=renewal`). No renovar si se registró/renovó en los últimos 30 días (lo aplica el servicio). Renovaciones premium NO por API |
| Transferencia | `POST /domain/transfer/{domain}` `{authCode, cost}` | Asíncrona, 5–7 días. `.uk` y premium NO por API |
| Lectura | `GET /domain/get/{domain}` | Estado, expiración, autoRenew, apiAccess, securityLock |
| Lista | `POST /domain/listAll` | Filtros, incluido `expiringWithinDays` (no usado por el servicio) |
| Nameservers | `GET /domain/getNs/{domain}`, `POST /domain/updateNs/{domain}` | Los nameservers se tratan como conjunto sin orden |

## Lo NO verificado (honesto, no inventado)

- **Auto-renew en Porkbun**: no hay endpoint confirmado en la documentación
  revisada. `setAutoRenew` del adaptador NO toca Porkbun a propósito:
  `RegisteredDomain.autoRenew` es solo un flag local y el auto-renew de
  Porkbun se gestiona en su panel. Si alguien encuentra el endpoint en la
  doc oficial, hay que citar la sección y cablearlo; mientras tanto, no se
  inventa.
- **Código EPP de salida**: NO existe endpoint. `getAuthCode` lanza
  `not-supported` (501): el código se obtiene en el panel de Porkbun.
- **Formato exacto de `domain/get` y `getNs`**: el resumen verificado
  confirma los campos, pero no su nombre JSON exacto. El adaptador lee de
  forma defensiva: el estado del dominio se busca en `domain.status` (o en
  el cuerpo si no es SUCCESS/ERROR), la expiración en `expiration` /
  `expiresAt` / `expiry`, y los nameservers en `ns` o `nameservers`. La
  primera prueba en sandbox debe confirmar el formato exacto.
- **Campo del precio de transferencia en `checkDomain`**: tampoco tiene un
  nombre verificado. Se lee de `additional.transfer.price` y, si no está,
  de `transferPrice`; si no hay ninguno, el servicio usa `TldPrice`.
- **Campo del cuerpo de `updateNs`**: se envía `{ns:[...]}` según la
  documentación oficial; confirmarlo en la primera prueba en sandbox.

## Sandbox (existe, con crédito falso)

Porkbun tiene sandbox con claves `pk1_sb_` / `sk1_sb_` y crédito falso; no
registra dominios reales. Procedimiento de prueba (SIN ejecutarlo aquí: no
hay credenciales del dueño):

1. Crear las claves sandbox en Porkbun y guardarlas en el plugin `porkbun`
   con modo `sandbox`.
2. `dryRun` de `create` (parámetro documentado de la API) para validar el
   flujo sin gastar nada.
3. Registro en sandbox de un dominio de prueba.
4. Primer registro real barato, con revisión manual del pedido y del
   dominio en el panel de Porkbun, antes de abrir la venta.
5. Abrir la venta (activar precios en `TldPrice` con `syncTldPrices`).

## Primer lote real (con revisión manual)

1. El dueño guarda las claves live en `/admin/plugins` (plugin `porkbun`,
   modo `live`) y recarga saldo en Porkbun.
2. `syncTldPrices()` trae los precios; se revisan en `/admin` y se activan
   solo los TLD que se quieren vender (un TLD solo se activa con los 3
   precios: registro, renovación y transferencia).
3. Pedido de prueba con un dominio barato real: se revisa el pedido, la
   factura, el cobro y el dominio creado en Porkbun antes de seguir.
4. Se comprueba el recordatorio de vencimiento y el auto-renew con crédito
   en un dominio de prueba antes de ofrecerlos.

## Reglas del servicio (`lib/domains.ts`)

- **Precio congelado**: el pedido y la factura guardan el precio de
  `TldPrice` en el momento de la compra. Cambiar `TldPrice` después no
  mueve ningún pedido ya creado.
- **Sin precio no hay venta**: un TLD sin fila activa en `TldPrice` no se
  vende (`createDomainOrder` lanza 400). `.pr` y otros TLD sin fila activa
  van por **registro asistido**: error 400 honesto
  ("registro asistido: ese TLD no se registra automáticamente, contacta con
  soporte"), nunca un precio inventado.
- **El cobro va por el flujo normal** (pasarela o confirmación manual). El
  servicio solo actúa después del pago confirmado (`afterDomainPayment`).
  Un dominio nunca crea un `CustomerService` ni una `Subscription` de
  hosting.
- **Fallo del registrador tras el cobro**: nunca lanza. El dominio queda en
  `pending` (registro) o activo con aviso (renovación) con `failureReason`
  saneado, y `retryDomainRegistration` lo reintenta cuando hay pago
  confirmado. Las renovaciones fallidas se reintentan con un pedido de
  renovación nuevo, no con `retryDomainRegistration`.
- **Renovación temprana**: Porkbun no permite renovar un dominio
  registrado o renovado hace menos de 30 días. El servicio lo aplica con
  `registeredAt`; no se guarda la fecha de la última renovación, así que
  una segunda renovación dentro de los 30 días de la anterior puede
  rechazarse en Porkbun y quedar en `failureReason`.
- **Transferencia**: el código EPP se guarda cifrado con secret-box (AAD
  `domain:auth-code:v1`) en `RegisteredDomain.authCodeEncrypted` al crear
  el pedido, y se borra al iniciarse la transferencia. Sin el código
  guardado no se inicia nada.
- **Recordatorios**: dominios activos que vencen en 30/14/7/1 días (±1 día
  de tolerancia), un aviso por dominio y umbral (evento
  `domain.renewal_reminder` con `dominio=…;umbral=N;entregado=si`). Si no
  hay SMTP, el aviso queda registrado como no entregado y reintenta al día
  siguiente. Nunca cobra ni renueva.
- **Auto-renew solo con crédito** (`tryAutoRenewWithCredit`): si el flag
  local está activado y el crédito no vencido del cliente cubre el precio
  de renovación, crea el pedido de renovación, consume el crédito en una
  transacción, registra el pago con provider `credit` y llama a
  `afterDomainPayment`. Sin crédito suficiente devuelve
  `{renewed:false, reason:"sin-credito"}` sin tocar nada. No hay tarjeta
  guardada para dominios: la suscripción de Stripe es de hosting, no de
  dominios.

## Permisos y eventos

- `domains:view` / `domains:write` en owner y admin (migración
  `20261118040000_domains_porkbun`). Soporte no los recibe.
- Eventos en `CommerceEvent`: `domain.registered`,
  `domain.register_failed`, `domain.renewed`, `domain.renew_failed`,
  `domain.transfer_started`, `domain.transfer_failed`,
  `domain.renewal_reminder`, `domain.auto_renew_paid`,
  `billing.tld_sync_failed`.

## GoDaddy

Solo el manifiesto en `lib/plugins.ts` (capacidades `["check"]`,
transport "pendiente"). No hay adaptador: `getRegistrar("godaddy")` lanza
`not-supported`.
