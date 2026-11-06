# CMS de textos (PageContent)

## Qué es

Modelo Prisma `PageContent` (`path` + `payload` JSON) con esquema tipado en `lib/page-content.ts`.
Cada campo tiene etiqueta en español, sección, tipo y máximo. Defaults = copy actual.

## Migración

```bash
npx prisma migrate deploy
# incluye 20261106210000_page_content
```

Sin migración o sin DB: la web usa defaults; el editor muestra aviso y **no afirma** guardado (API 503).

## Admin

- `/admin/pages` — editor por página/sección, búsqueda, preview, restaurar, dirty state.
- `/admin/site` — branding, apariencia (pares tipográficos, densidad, superficie, contraste), hero/CTAs globales, catálogo, SEO.

## API

- `GET/POST /api/admin/page-content` — autenticado + `trustedWrite` en mutaciones.
- `GET /api/page-content?path=/about` — público, solo textos (sin secretos).

## Límites

- Texto plano, sin HTML arbitrario.
- Enlaces: https o rutas internas validadas (`isSafeHref`).
- No modifica WHMCS ni procesa pagos.


## Base de datos / Supabase

- Prisma necesita Postgres alcanzable. La URL directa `db.<ref>.supabase.co:5432` es IPv6; en redes IPv4-only usar **Session pooler** (`postgres.<ref>@aws-0-<region>.pooler.supabase.com:5432?sslmode=require`) según docs de Supabase.
- Si `DATABASE_URL` o la publishable key de Vercel fallan (P1001 / Invalid API key), el CMS **no guarda**: solo sirve defaults. No tratar eso como éxito.
- No crear proyecto nuevo sin confirmación del usuario. No tocar proyectos ajenos.


## TEMP `/api/admin/db-setup` (eliminar tras BD sana)

- **GET** (sesión admin): `current_database` / `current_user` / tablas / forma de `DATABASE_URL` (host/user, sin password) / tablas esperadas.
- **POST** (admin + `Origin` = Host): `{"action":"apply"}` crea `SiteSetting`/`CatalogConfig`/`PageContent` (IF NOT EXISTS, sin DROP); `probe_write` hace insert/delete transaccional; `diagnose` igual que GET.
- No acepta SQL arbitrario. Respuestas 503 si BD no alcanza — no simula éxito.
- Quitar la ruta cuando Supabase/Vercel responda bien.
