# Cobro con PayPal

Las facturas propias se pueden pagar en línea con PayPal (Orders API v2). El cobro
manual del administrador sigue existiendo y no se ha tocado.

## Variables

```
PAYPAL_ENV=sandbox        # o live
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
NEXT_PUBLIC_SITE_URL=https://caluservers.com
```

Las claves salen de developer.paypal.com → Apps & Credentials, del **mismo entorno**
que `PAYPAL_ENV`. Sin las cuatro primeras, `/cuenta` no ofrece pago en línea y las
rutas de pago responden 503. No existe un modo de prueba que simule un cobro.

`BILLING_CURRENCY` y `TAX_MODE=none` siguen siendo obligatorias: una proforma no
cobrable no se puede pagar.

## Webhook

Crea el webhook en la misma app de PayPal:

- URL: `https://TU-DOMINIO/api/paypal/webhook`
- Eventos: `PAYMENT.CAPTURE.COMPLETED` y `CHECKOUT.ORDER.COMPLETED`

Copia su id en `PAYPAL_WEBHOOK_ID`. **Sin esa variable el webhook responde 503 y no
registra nada**: un aviso sin verificar no mueve dinero. La firma se verifica contra
la API de PayPal en cada evento, y el `cert_url` solo se acepta si es de `paypal.com`.

## Flujo

1. El cliente crea el pedido en `/cuenta/contratar`. Se emite la factura.
2. «Pagar con PayPal» llama a `POST /api/account/paypal` con `action: "start"`.
   El importe, la moneda y el dueño salen de la base; del navegador solo viaja el id
   de la factura.
3. PayPal devuelve al cliente a `/cuenta/pago`, donde confirma con un clic.
   `action: "capture"` captura la orden y registra el cobro.
4. En paralelo, el webhook de PayPal registra el mismo cobro. La referencia de
   captura es única en la base, así que las dos vías juntas dejan **un solo cobro**:
   la que llegue segunda devuelve el que ya existe.
5. Tras el cobro se intenta el alta automática (ver `PROVISION_WHM.md`). Si el alta
   falla, el pago sigue registrado y el servicio queda pendiente.

## Comprobaciones antes de registrar un cobro

- El importe capturado tiene que coincidir **exactamente** con el total de la factura.
- La moneda también.
- La factura tiene que ser del cliente de la sesión, no anulada y no pagada.
- El `custom_id` que vuelve de PayPal tiene que ser la factura que se está pagando.

Si algo no cuadra, no se registra nada y se responde 409.

## Límites conocidos

- Monedas sin decimales (JPY, HUF, TWD) se rechazan: el resto de la app trabaja en
  céntimos. Si el negocio necesita una de ellas, hay que tocar el modelo de importes.
- No hay suscripciones ni cobro recurrente: cada factura se paga una vez.
- No hay reembolsos desde el panel. Un reembolso se hace en PayPal y se anota a mano.
