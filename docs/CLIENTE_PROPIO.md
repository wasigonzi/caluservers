# Área propia de clientes

Esta área sustituye, dentro de esta aplicación, el uso de WHMCS para cuentas, pedidos, facturas, servicios y tickets. El portal remoto no se borra ni se migra desde aquí: las tarjetas de planes lo enlazan como «Portal anterior» y las rutas de su API responden 410.

El cliente se registra, contrata en `/cuenta/contratar` y sigue su pedido en el panel del cliente (facturas y servicios). **No hay verificación de correo**: por decisión del propietario (2026-11-13) el cliente entra y contrata al registrarse, sin correo de verificación ni exigencia de `emailVerified` en ningún sitio (`lib/customer-auth.ts`, `requireEmailVerification: false`).

## Qué decide el propietario

- `BILLING_CURRENCY`: código ISO de 3 letras. Sin ella no hay pedidos. El valor de prueba `USD` no es una decisión comercial.
- `TAX_MODE=none` solo si no hay impuesto. Cualquier otro valor, o la ausencia, deja la factura como proforma no cobrable. No hay una tasa inventada.
- `SMTP_URL` y `MAIL_FROM` para la **recuperación de contraseña** y los **avisos** (credenciales del alta en WHM, formularios de contacto y abuso, tickets). Sin SMTP, en producción no se envía el enlace de recuperación y la API no lo devuelve. La verificación de correo no existe, así que SMTP no tiene nada que ver con ella.
- `BETTER_AUTH_SECRET` (32+ caracteres) y `BETTER_AUTH_URL`. Sin el secreto, el área responde 503.
- Pasarela de pago: **PayPal (Orders API v2)**, con las credenciales en entorno (`PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`). Ver `docs/COBRO_PAYPAL.md`. Sin esas credenciales no hay pago en línea y el cobro sigue siendo manual y auditado desde `/admin/facturas`.
- Alta de servicio: tras el pago confirmado se intenta el **alta automática en WHM** si está activada en `/admin/provision` (ver `docs/PROVISION_WHM.md`). Si no está activada o falla, el servicio queda en `pending_provision` con su motivo y el admin lo reintenta desde `/admin/servicios`.
- Importación de clientes WHMCS: no está ejecutada. Más adelante haría falta un archivo controlado y una revisión humana.

## Correo de prueba

`MAIL_SINK_DIR` solo escribe enlaces si `NODE_ENV` no es `production`. En producción se ignora.

## Lista completa de credenciales

Ver `docs/CREDENCIALES-PENDIENTES.md`: PayPal, SMTP, WHM (lectura y escritura) y paquetes.
