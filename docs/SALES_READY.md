# Checklist listo para vender (manual)

Esta app deja la **vitrina y el embudo** listos: planes, CTAs y enlaces al portal WHMCS.
**No procesa pagos ni crea pedidos** fuera de WHMCS. Antes de vender de verdad:

## 1. Variables de entorno

Copia `.env.example` → `.env.local` y rellena:

- `DATABASE_URL` — Postgres reachable
- `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` (`npm run admin:hash`)
- `AUTH_SECRET` (≥32 chars)
- `SETTINGS_ENCRYPTION_KEY` (64 hex)
- `WHMCS_ALLOWED_HOST` (hostname HTTPS del portal API, p.ej. `client.caluservers.com`)
- `BLOB_READ_WRITE_TOKEN` (opcional; logos vía Vercel Blob Public)
- `NEXT_PUBLIC_SITE_URL` (canónica, p.ej. `https://caluservers.com`)

## 2. Base de datos

```bash
npx prisma migrate deploy
# o en desarrollo: npx prisma db push
```

Migraciones: `SiteSetting`, `CatalogConfig`.

## 3. WHMCS

- Credenciales API de **solo lectura** en `/admin/settings` (cifradas).
- Los enlaces `purchaseUrl` de hosting y VPS deben seguir siendo productos concretos de la tienda. Un `cart.php` sin producto no muestra «Ordenar».
- Dedicados: la tienda pública no los lista. La web muestra consulta, no un pedido.
- Dominios: el buscador abre `cart.php?a=add&domain=register` en el portal. Esta web no comprueba disponibilidad.
- No uses este panel para cobrar; el cobro es WHMCS.

## 4. Vercel / Blob

- Blob store **Public** si vas a subir logos/favicon/OG.
- Dominio + HTTPS + variables en Production/Preview.

## 5. Contenido comercial

- El precio público de VPS New York / Normal es «Desde $12.99/mes» (listado de tienda, 2026-11-09). No publiques `$0.00`.
- Publicar branding/SEO desde `/admin/site`.
- Probar en móvil la bottom nav y un flujo hasta el carrito WHMCS **sin pagar**.

## 6. Lo que esta app no garantiza

- SLA contractual, uptime legal, impuestos, chargebacks.
- Envío de leads por formulario propio (contacto abre ticket WHMCS).
- MFA admin sigue siendo opcional (`ADMIN_TOTP_SECRET`). El límite de login ya está en Postgres y se comparte entre instancias.
