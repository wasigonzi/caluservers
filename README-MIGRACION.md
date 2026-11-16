# CaluServers · Next.js 15 + Prisma + WHM

Aplicación pública de marketing y panel admin, con **área propia de clientes**:
el pedido se crea en `/cuenta/contratar`, el pago en línea es PayPal
(Orders API v2) y el alta de hosting puede ser automática en WHM. El portal
WHMCS externo queda como «Portal anterior» en las tarjetas de planes. Este
panel no restaura la API WHMCS: esas rutas responden 410.

La operación de servidor es WHM / cPanel: lectura (`listaccts`, `listpkgs`)
con un token de solo lectura en `/admin/settings`, y alta de cuentas
(`createacct`) con un segundo token en `/admin/provision`. Ver
`docs/PROVISION_WHM.md`.

Los tests de WHM y de Blob usan dobles o el estado «no configurado». **No demuestran conexión real** con un servidor WHM ni con un Blob store.

## Requisitos

- Node.js 22 (o 20.9+)
- PostgreSQL 16
- Variables de `.env.example`

## Instalación limpia

```bash
npm ci
cp .env.example .env.local
# Rellena DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD_HASH (`npm run admin:hash`),
# AUTH_SECRET (>=32) y SETTINGS_ENCRYPTION_KEY (64 hex).
npx prisma migrate deploy
npm run dev
```

`prisma migrate deploy` en una base vacía aplica las migraciones de ajustes, catálogo, textos, `IntegrationConfig` + `AdminAudit` y `LoginThrottle`. Una base que ya aplicó migraciones anteriores recibe solo las que le faltan. No edites los SQL antiguos: Prisma guarda su checksum.

Sin `AdminAudit`, un guardado no debe publicarse. Contenido y auditoría van en la misma transacción.

MFA es opcional. `npm run admin:totp` imprime un secreto; defínelo como `ADMIN_TOTP_SECRET` para exigir el código. Si la variable no existe, el login sigue siendo email y contraseña.

El límite de intentos está en la tabla `LoginThrottle` y lo comparten todas las instancias. La clave guardada es un HMAC, no la IP. Si esa tabla o la base no responden, el login se rechaza (503): no hay un modo que deje pasar intentos ilimitados. Hace falta `npx prisma migrate deploy` antes de entrar al panel.

## Migraciones en producción

El build ejecuta `scripts/migrate-on-deploy.mjs`. Solo con `VERCEL_ENV=production` aplica
`prisma migrate deploy`; en vistas previas y en local no toca el esquema. Prueba con
`DATABASE_URL` y, si falla, con `DIRECT_URL`. Si no puede migrar, el despliegue continúa y
`/admin/configuracion` indica qué falta en la base.

## Rutas

- Público: `/`, `/web-hosting`, `/vps`, `/dedicated`, `/domains`, `/about`, `/contact`, legales, `/abuse`, `/client`
- Admin: `/admin/login`, `/admin` (resumen), `/admin/site`, `/admin/pages`, `/admin/settings` (WHM)
- Admin · negocio: `/admin/clientes`, `/admin/facturas`, `/admin/servicios`, `/admin/tickets`, `/admin/mensajes`, `/admin/actividad`. Ver `docs/PANEL_ADMIN.md`.

El aviso de la cabecera es texto manual. No consulta la red. Contacto y abuso se guardan en la base y se ven en `/admin/mensajes` (con aviso por correo si hay SMTP); los tickets son propios, no de WHMCS. Dominios tiene búsqueda de disponibilidad por RDAP, pero esta web no registra dominios. Los dedicados no tienen producto en la tienda pública, así que no muestran «Ordenar».

## Cuenta propia

El alta de clientes, pedidos, facturas, servicios y tickets propios está en `docs/CLIENTE_PROPIO.md`. No reemplaza todavía el portal remoto ni una contabilidad legal. La pasarela de pago es **PayPal** (ver `docs/COBRO_PAYPAL.md`); sin sus credenciales el cobro es manual desde `/admin/facturas`. El alta en WHM es automática si está activada (ver `docs/PROVISION_WHM.md`).

## Comprobaciones

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm test` incluye la regresión de migraciones y de rollback cuando `DATABASE_URL` apunta a Postgres. `test:e2e` crea la base `caluservers_e2e` en ese mismo servidor. Si Playwright no encuentra su navegador, `E2E_CHROMIUM_PATH` apunta a un Chromium ya instalado.
