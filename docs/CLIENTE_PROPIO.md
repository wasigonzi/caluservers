# Área propia de clientes

Esta área sustituye, dentro de esta aplicación, el uso de WHMCS para cuentas, pedidos, facturas, servicios y tickets. El portal remoto no se borra ni se migra desde aquí.

Depende de las correcciones de la rama `cursor/fix-e2e-functional-18bc` (PR 12). No la mergees por separado sobre un `main` que no las tenga.

## Qué decide el propietario

- `BILLING_CURRENCY`: código ISO de 3 letras. Sin ella no hay pedidos. El valor de prueba `USD` no es una decisión comercial.
- `TAX_MODE=none` solo si no hay impuesto. Cualquier otro valor, o la ausencia, deja la factura como proforma no cobrable. No hay una tasa inventada.
- `SMTP_URL` y `MAIL_FROM` para enviar verificación y recuperación. Sin SMTP, en producción no se envía el enlace y la API no lo devuelve.
- `BETTER_AUTH_SECRET` (32+ caracteres) y `BETTER_AUTH_URL`. Sin el secreto, el área responde 503.
- Pasarela de pago: no hay una elegida. Confirmar un pago es un acto manual y auditado del administrador. No existe cobro automático.
- Alta de servicio: después del pago el estado es `pending_provision`. Activarlo es otro paso manual. No llama a WHM.
- Importación de clientes WHMCS: no está ejecutada. Más adelante haría falta un archivo controlado y una revisión humana.

## Correo de prueba

`MAIL_SINK_DIR` solo escribe enlaces si `NODE_ENV` no es `production`. En producción se ignora.
