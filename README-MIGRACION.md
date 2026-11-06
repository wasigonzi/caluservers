# CaluServers · Next.js 15 + Prisma + WHMCS

`main` ya está migrado a Next.js 15 (App Router), TypeScript, Tailwind, Prisma/PostgreSQL y dashboard WHMCS con credenciales cifradas (AES-256-GCM). La web pública premium y los ajustes de sitio (CMS ligero) viven en la rama de producto; no se usa Vite ni Supabase en esta arquitectura.

## Requisitos

- Node.js 20.9+
- PostgreSQL (local o gestionado)
- Variables de entorno (ver `.env.example`)

## Configuración de base de datos (manual)

1. Copiar `.env.example` → `.env.local` y rellenar:
   - `DATABASE_URL`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (`npm run admin:hash`)
   - `AUTH_SECRET` (≥32 caracteres aleatorios)
   - `SETTINGS_ENCRYPTION_KEY` (64 hex)
   - `WHMCS_ALLOWED_HOST` (hostname HTTPS permitido para la API)
2. Aplicar esquema/migraciones **en tu entorno** (no se ejecutan desde este repositorio hacia producción remota):
   - Desarrollo: `npx prisma migrate dev` o `npx prisma db push`
   - Producción: `npx prisma migrate deploy`
3. Migraciones: `20261106120000_site_settings` (`SiteSetting`) y `20261106140000_catalog_config` (`CatalogConfig`) (ajustes públicos). Sin ella, la web usa defaults de `lib/site-settings.ts` / `SEED_CATALOG`.

## Arranque

```bash
npm install
npx prisma generate
npm run dev
```

- Web pública: `/`, `/web-hosting`, `/vps`, `/dedicated`, `/domains`, `/about`, `/contact`, legales, `/abuse`, `/client`
- Admin: `/admin/login` → dashboard WHMCS, `/admin/settings` (API cifrada), `/admin/site` (Estudio PRO: branding, secciones, catálogo, SEO, nav)

## Seguridad

- Auth admin por cookie HMAC + scrypt; writes con comprobación de origen (`trustedWrite`).
- Secretos WHMCS solo en servidor, cifrados en PostgreSQL. Nunca en cliente ni en Git.
- Acciones WHMCS limitadas a lecturas (`GetClients`, `GetOrders`, `GetInvoices`, `GetProducts`, `GetTickets`, `GetClientsProducts`).
- Endpoints de ajustes del sitio requieren admin autenticado.
- No hay service-role ni claves en el navegador.

## Catálogo

Planes semilla en `lib/catalog.ts` (referencia pública). La gestión completa de catálogo en panel queda fuera de alcance seguro de este PR; se pueden ampliar modelos Prisma más adelante.

## Limitaciones

- No se modifican pedidos ni se cobran desde esta app.
- MFA y rate-limit distribuido recomendados antes de producción.
- Aplicar migraciones y secrets solo en infra controlada.
