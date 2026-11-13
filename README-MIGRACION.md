# CaluServers · Next.js 15 + Prisma + WHM de sólo lectura

Aplicación pública de marketing y panel admin. El pedido y el pago ocurren en el portal WHMCS externo. Este panel no restaura la API WHMCS: esas rutas responden 410. La operación de servidor es WHM / cPanel en sólo lectura (`listaccts`, `listpkgs`).

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

## Rutas

- Público: `/`, `/web-hosting`, `/vps`, `/dedicated`, `/domains`, `/about`, `/contact`, legales, `/abuse`, `/client`
- Admin: `/admin/login`, `/admin` (resumen), `/admin/site`, `/admin/pages`, `/admin/settings` (WHM)
- Admin · negocio: `/admin/clientes`, `/admin/facturas`, `/admin/servicios`, `/admin/tickets`, `/admin/mensajes`, `/admin/actividad`. Ver `docs/PANEL_ADMIN.md`.

El aviso de la cabecera es texto manual. No consulta la red. Contacto, abuso y dominios abren el portal externo; esta web no envía tickets ni registra dominios. Los dedicados no tienen producto en la tienda pública, así que no muestran «Ordenar».

## Cuenta propia

El alta de clientes, pedidos, facturas, servicios y tickets propios está en `docs/CLIENTE_PROPIO.md`. No reemplaza todavía el portal remoto ni una contabilidad legal. La pasarela de pago no está elegida.

## Comprobaciones

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm test` incluye la regresión de migraciones y de rollback cuando `DATABASE_URL` apunta a Postgres. `test:e2e` crea la base `caluservers_e2e` en ese mismo servidor. Si Playwright no encuentra su navegador, `E2E_CHROMIUM_PATH` apunta a un Chromium ya instalado.
