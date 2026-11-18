# Fraude (Fase 6, frente A)

Detección propia de fraude. Solo marca: ningún pago se bloquea por un
flag en esta fase. El bloqueo real es decisión del dueño (ver abajo).

## Cómo funciona

Al crear un pedido, `createCustomerOrder` (`lib/commerce.ts`) evalúa el
pedido con `evaluateFraud` (`lib/fraud.ts`) DESPUÉS de crear el pedido y
ANTES de cobrar (el cobro es otra llamada posterior). La evaluación lee
las `FraudRule` activas de la base de datos, en orden.

Si alguna regla marca, se crea un `FraudFlag` en estado `open` con el
motivo en español, y el pedido queda señalado para revisión con el evento
`fraud.flagged` en el diario de comercio (`CommerceEvent`, `entityId` =
id del pedido). El pedido sigue su flujo normal: el pago NO se bloquea
por defecto.

La evaluación nunca lanza: ante cualquier error devuelve
`{ flagged: false, flags: [] }` y lo registra en el log del servidor,
para que un fallo del motor de fraude nunca tumbe un pedido.

## Reglas (sembradas en la migración 20261118080000)

| Regla | Tipo | Umbral por defecto | Qué marca |
| --- | --- | --- | --- |
| Demasiados pedidos en una hora | `velocity` | más de 3 pedidos en 60 min | El usuario crea más de 3 pedidos en la ventana. El pedido que se evalúa ya está creado y cuenta: 4 pedidos en 1 h marca, 3 no. |
| Pedido de importe alto | `amount` | total mayor de $500 (50000 céntimos) | El total del pedido supera el máximo. |
| Correo de dominio desechable | `email_domain` | dominios: mailinator.com, tempmail.com, guerrillamail.com, 10minutemail.com, yopmail.com | El dominio del correo del cliente está en la lista. |
| Muchas cuentas desde la misma IP | `ip` | más de 3 cuentas distintas | Más de 3 cuentas distintas comparten el mismo hash de IP en 24 h. |

Los umbrales viven en `FraudRule.configJson` (`maxOrders` /
`windowMinutes`, `maxCents`, `domains`, `maxAccounts` /
`windowMinutes`). Cambiar un umbral es cambiar esa fila en la base de
datos; no hay panel de edición de reglas en esta fase.

## Revisión en el panel

`/admin/fraude` (permiso `orders:view`: los flags nacen de pedidos y los
revisa quien gestiona pedidos) lista los flags abiertos y los revisados
recientemente. Acciones (ruta `POST /api/admin/fraud`, mismo permiso):

- **Aprobar**: el flag pasa a `cleared` (falso positivo). `reviewedBy` es
  el email del admin y `reviewedAt` la fecha de revisión.
- **Confirmar fraude**: el flag pasa a `confirmed`.

Ninguna de las dos acciones bloquea ni desbloquea un pago: el pago nunca
se bloqueó por un flag. Si un pedido confirmado como fraude necesita
anularse o reembolsarse, eso se hace por las vías existentes (anular
factura / reembolsar cobro en `/admin/facturas`).

## Qué falta para MaxMind

MaxMind minFraud NO está activo: no hay cuenta, no hay clave y el código
no llama a ningún servicio externo.

Para activarlo haría falta, en este orden:

1. El dueño contrata una cuenta de MaxMind (minFraud) y entrega la
   `license key`.
2. Guardar la clave como secreto (nunca en claro ni en el repo) y añadir
   la llamada a minFraud en `lib/fraud.ts`, con su propio timeout y sin
   tumbar el pedido si MaxMind no responde.
3. El dueño fija el umbral de riesgo (puntuación minFraud a partir de la
   cual se marca) y si esa marca es solo `flag` o también `block`.
4. Probar con pedidos reales de prueba antes de abrirlo a clientes.

Sin la decisión del dueño sobre la contratación y el umbral, MaxMind se
queda como esqueleto documentado, no como código a medio conectar.

## Procedimiento para activar "block" en una regla

Hoy todas las reglas están en modo `flag`. Una regla con `action`
`"block"` se trata como `"flag"` en esta fase y el motivo del flag deja
constancia de ello; no se ejecuta ningún bloqueo.

Para activar el bloqueo real de una regla, el dueño debe decidirlo de
forma explícita, porque un bloqueo mal calibrado rechaza clientes
legítimos. El procedimiento es:

1. El dueño dice qué regla pasa a `block` y con qué umbral (por ejemplo,
   solo `velocity`, o solo `amount` por encima de un importe mayor).
2. Se cambia `FraudRule.action` a `"block"` para esa regla en la base de
   datos.
3. Se implementa el bloqueo en `lib/commerce.ts`: cuando `evaluateFraud`
   marque una regla en modo `block`, el pedido se crea pero queda en
   estado de revisión y `recordPayment` rechaza el cobro de su factura
   hasta que un admin lo apruebe en `/admin/fraude` (aprobar = `cleared`
   desbloquea el cobro).
4. Se prueba el flujo completo con un pedido de prueba (bloqueo,
   aprobación, cobro posterior) antes de dejarlo activo.

Hasta que esos pasos se hagan, `block` sigue siendo solo una marca.

## Limitaciones conocidas

- **Regla de IP**: el hash de la IP se busca en el diario de auditoría
  unificado (`AuditLog.ipHash`); es el único sitio donde se guarda la IP
  hasheada. Hoy `createCustomerOrder` no recibe la IP del cliente
  (`ipHash` es opcional y ningún llamador la pasa), así que la regla no
  puede marcar hasta que el checkout pase el hash de la IP y el diario
  de auditoría registre entradas con ese hash. Hasta entonces la regla
  existe, está activa y nunca dispara: no marca por falta de datos.
- **Reglas sin panel de edición**: los umbrales y la lista de dominios
  desechables se cambian directamente en la base de datos.
- **Sin alertas automáticas**: un flag no genera alerta ni correo; el
  admin lo ve en `/admin/fraude`. Las alertas son del frente B.
