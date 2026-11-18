# Plugins

Registro de pasarelas de pago, registradores de dominios y paneles de
hosting. El panel (`/admin/plugins`) y la API (`/api/admin/plugins`) se
generan desde los manifiestos: **añadir un plugin no toca ninguna
pantalla**.

## Cómo añadir un plugin nuevo

1. **Manifiesto** en `lib/plugins.ts` (`PLUGIN_MANIFESTS`): una entrada
   con `key` (única, estable), `kind` (`payment` | `registrar` |
   `panel`), `label`, `description`, `configSchema`, `secretFields`,
   `capabilities` y `transport`.
   - `configSchema`: configuración **no secreta** que el admin edita en
     el panel. Tipos: `text`, `password`, `select`, `number`, `textarea`,
     `checkbox`. La API valida en servidor contra este esquema; los
     campos desconocidos se descartan.
   - `secretFields`: credenciales. Se guardan cifradas con
     `lib/secret-box.ts` (AES-256-GCM, AAD `plugin:<key>:v1`) y **nunca**
     se devuelven por la API ni se pre-rellenan en el formulario.
   - `capabilities`: lista libre (`checkout`, `refund`, `recurring`,
     `manual`, `create`, `suspend`, `terminate`, `list`, …) que el panel
     muestra y que el resto del código puede consultar.
   - `transport`: dónde vive el adaptador real (o `pendiente` si aún no
     existe).
2. **Fila en la base**: la migración
   `20261118030000_plugins_billing` siembra los cuatro plugins
   conocidos desactivados. Para uno nuevo, añade un `INSERT … ON
   CONFLICT DO NOTHING` en una migración nueva (o crea la fila desde el
   panel de base de datos): `key`, `kind`, `label`, `enabled = false`.
3. **Adaptador**: implementa la interfaz que toca en
   `lib/plugin-types.ts` (`PaymentGateway`, `DomainRegistrar` o
   `ControlPanel`) en su propio módulo. Lee la configuración con
   `getPluginConfig(key)` y los secretos con `getPluginSecrets(key)`.
4. **Uso**: comprueba `isPluginEnabled(key)` antes de llamar al
   adaptador. Sin credenciales guardadas, el adaptador debe fallar con
   un error claro; **nunca simular** un cobro, un registro ni un alta.

## Secretos y auditoría

- Cada cambio (activar/desactivar, guardar config, guardar secretos)
  queda en `AdminAudit` (`plugin.toggled`, `plugin.config_saved`,
  `plugin.secrets_saved`) sin valores, solo la clave del plugin.
- Rotar un secreto es guardar uno nuevo: `lastRotatedAt` se actualiza
  en cada guardado.
- Si un secreto no descifra (clave maestra cambiada o dato corrupto),
  `getPluginSecrets` lanza un error genérico sin filtrar el valor:
  hay que volver a guardar los secretos.

## Estado actual (Fase 2, frente A)

| Plugin | kind | Estado |
| --- | --- | --- |
| `stripe` | payment | Manifiesto listo; adaptador pendiente (frente B) |
| `paypal` | payment | Manifiesto listo; el cobro actual sigue por variables `PAYPAL_*` hasta que el frente B lea el registro |
| `bank_transfer` | payment | Operativo: instrucciones en Configuración → «Instrucciones de pago manual», confirmación manual en Pedidos y facturas |
| `whm` | panel | Manifiesto listo; usa el transporte existente (`lib/whm-transport.ts` + `lib/whm-provision.ts`), credenciales en «Conexión WHM» |

Los registradores (Porkbun) llegan en la Fase 3 y Plesk/DirectAdmin en
la Fase 4: cada uno será un manifiesto más su adaptador, nada más.

## Stripe Billing y las renovaciones (Fase 3)

- **Los cuatro ciclos se pueden representar en Stripe Billing** (sin
  limitación que documentar como imposible): monthly → mes (1),
  quarterly → mes (3), semiannual → mes (6), annual/yearly → año (1).
  El mapeo vive en `stripeRecurringForCycle` (`lib/stripe.ts`).
- **Conexión tras el primer pago** (`ensureStripeBillingSubscription`,
  `lib/stripe.ts`): al confirmarse el primer pago con Stripe —tanto en
  la vuelta del cliente (`finishStripeCheckout`) como en el webhook—
  se crea la suscripción de Stripe Billing y su id se guarda en
  `Subscription.gatewaySubscriptionId`. Es idempotente (si ya hay id,
  no llama a Stripe) y nunca tumba el cobro: si Stripe falla, queda
  registrado como `billing.stripe_subscription_failed` y la renovación
  sigue el camino de siempre (factura impaga + dunning). El cron cobra
  las renovaciones con el método guardado solo cuando ese id existe.
- **Limitaciones honestas**:
  - El id del cliente de Stripe **no se guarda** (no hay campo en la
    base): cada suscripción crea su propio cliente en Stripe. El cobro
    de renovaciones usa el id de la suscripción, que sí se guarda.
  - Las suscripciones pagadas con Stripe **antes de esta conexión no
    tienen id de Stripe Billing**: su próxima renovación se factura
    como siempre y debe pagarse a mano (o por un nuevo Checkout); ese
    pago sí conectará la suscripción y las renovaciones siguientes ya
    se cobrarán solas.
  - Una suscripción con ciclo desconocido no se conecta (queda
    `billing.stripe_subscription_failed` con `unsupported-cycle`) y
    nunca se adivina un intervalo.
