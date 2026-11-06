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
