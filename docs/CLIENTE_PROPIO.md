# Área propia de clientes

Esta área sustituye, dentro de esta aplicación, el uso de WHMCS para cuentas, pedidos, facturas, servicios y tickets. El portal remoto no se borra ni se migra desde aquí. No hay paridad total con WHMCS.

El PR parte de `main`, que ya incluye las correcciones previas de almacenamiento y pruebas. No hace falta mergear otra rama por separado.

## Contexto comercial ya decidido

- Moneda: dólar estadounidense (USD), con dos decimales. `399` unidades menores se muestran como `3,99 USD`, nunca como `399 USD`.
- Los precios de lista confirmados no se convierten ni se cambian. Un plan de `$3.99` sigue valiendo 399 centavos internos y se presenta como `3,99 USD`.
- Emisor previsto: Puerto Rico. Solo consta la jurisdicción.

## Qué falta y no se inventa

No hay razón social, municipio, dirección, registro fiscal ni tipo de contribuyente. No hay tratamiento fiscal de hosting, servicios ni clientes. No se aplica una tasa, un IVU ni una exención.

- `BILLING_CURRENCY=USD` es lo que el propietario debe definir al desplegar. Si el entorno no la trae, no se muestra ni se cobra un importe.
- `TAX_MODE` no se define. Sin una política fiscal explícita la factura es proforma (`PF-…`), no cobrable, y la confirmación de pago responde 409. Una proforma ya creada no pasa a emitida solo por cambiar el entorno.
- Pasarela live: no hay una elegida y no se activa. El código de PayPal solo habla con `api-m.sandbox.paypal.com` o, fuera de producción, con un simulador local. No usa el token temporal del conector (`PAYPAL_SANDBOX_ACCESS_TOKEN`). Las credenciales OAuth de la app sandbox (`PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, `PAYPAL_SANDBOX_WEBHOOK_ID`) no están en el repositorio. Sin ellas no hay llamada remota. El sandbox real queda pendiente de conexión.
- Alta de servicio: no ocurre sin un pago confirmado, y aun entonces queda pendiente de un paso manual. No llama a WHM ni a cPanel.
- `SMTP_URL` y `MAIL_FROM` envían verificación y recuperación. Sin SMTP, en producción no se envía el enlace y la API no lo devuelve.
- `BETTER_AUTH_SECRET` (32+ caracteres) y `BETTER_AUTH_URL`. Sin el secreto, el área responde 503.
- Importación de clientes WHMCS: no está ejecutada.

## Correo de prueba

`MAIL_SINK_DIR` solo escribe enlaces si `NODE_ENV` no es `production`. En producción se ignora.
