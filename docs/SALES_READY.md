# Checklist listo para vender (manual)

Esta app **sí procesa pedidos y pagos propios**: el cliente contrata en
`/cuenta/contratar`, se emite la factura propia y paga en línea con PayPal
(Orders API v2) o el admin confirma el cobro a mano. Tras el pago confirmado,
el alta en WHM puede ser automática (ver `docs/PROVISION_WHM.md`).

El portal WHMCS (`client.caluservers.com`) sigue existiendo como **portal
anterior**: las tarjetas de planes muestran «Contratar aquí» (pedido propio)
y «Portal anterior» (enlace secundario a la tienda WHMCS). El cobro ya no
depende de WHMCS: las rutas de su API responden 410.

Antes de vender de verdad, completa la lista de credenciales en
`docs/CREDENCIALES-PENDIENTES.md`.

## 1. Variables de entorno

Copia `.env.example` → `.env.local` y rellena:

- `DATABASE_URL` — Postgres reachable
- `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` (`npm run admin:hash`)
- `AUTH_SECRET` (≥32 chars)
- `SETTINGS_ENCRYPTION_KEY` (64 hex)
- `BETTER_AUTH_SECRET` (≥32 chars) y `BETTER_AUTH_URL` — sin el secreto, el registro de clientes responde 503
- `BILLING_CURRENCY` (código ISO de 3 letras) y `TAX_MODE=none` — sin moneda no hay pedidos; sin `TAX_MODE=none` la factura queda como proforma no cobrable
- `SMTP_URL` y `MAIL_FROM` — recuperación de contraseña y avisos (credenciales de alta, contacto, tickets). Sin SMTP no sale ningún correo
- `PAYPAL_ENV` / `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID` — sin ellas no hay pago en línea; el cobro sigue siendo manual desde `/admin/facturas`
- `WHMCS_ALLOWED_HOST` (hostname HTTPS del portal anterior, p.ej. `client.caluservers.com`)
- `BLOB_READ_WRITE_TOKEN` (opcional; logos vía Vercel Blob Public)
- `NEXT_PUBLIC_SITE_URL` (canónica, p.ej. `https://caluservers.com`)

## 2. Base de datos

```bash
npx prisma migrate deploy
# o en desarrollo: npx prisma db push
```

Migraciones: `SiteSetting`, `CatalogConfig`, área propia de clientes
(pedidos, facturas, servicios, tickets), cobro por pasarela y alta automática.

## 3. Pedidos y cobro propios

- El cliente crea el pedido en `/cuenta/contratar` y lo sigue en el panel del cliente (`/cuenta/facturas/[id]`).
- El pago en línea es PayPal: el importe y la moneda salen de la factura en base, nunca del navegador. Sin credenciales de PayPal, `/cuenta` no ofrece pago en línea y el admin confirma el cobro a mano desde `/admin/facturas`.
- No hay suscripciones ni cobro recurrente: cada factura se paga una vez. No hay reembolsos desde el panel; un reembolso se hace en PayPal y se anota a mano.
- Tras el pago confirmado se intenta el alta automática en WHM si está activada en `/admin/provision`. Si falla, el pago sigue registrado y el servicio queda pendiente para reintentarlo.
- El alta de clientes no exige verificación de correo: el cliente entra y contrata al registrarse. La recuperación de contraseña sí necesita SMTP.

## 4. Vercel / Blob

- Blob store **Public** si vas a subir logos/favicon/OG.
- Dominio + HTTPS + variables en Production/Preview.

## 5. Contenido comercial

- El precio público de VPS New York / Normal es «Desde $12.99/mes» (listado de tienda, 2026-11-09). No publiques `$0.00`.
- **Servidores dedicados**: vienen sin precio publicado, así que `/dedicated` no muestra «Contratar aquí». En cuanto el propietario les pone precio confirmado y URL de compra (`/cuenta/contratar?plan=<id>`) desde el catálogo del panel, la tarjeta muestra el botón y el pedido se crea con factura, igual que el hosting y el VPS.
- Publicar branding/SEO desde `/admin/site`.
- Probar en móvil la bottom nav y un flujo completo hasta el pago (sin pagar en live: usa el entorno sandbox de PayPal).

## 6. Lo que esta app no garantiza

- SLA contractual, uptime legal, impuestos, chargebacks.
- MFA admin sigue siendo opcional (`ADMIN_TOTP_SECRET`). El límite de login ya está en Postgres y se comparte entre instancias.
- Cancelar un servicio en el panel no suspende ni borra la cuenta en WHM: eso se hace en el servidor.
