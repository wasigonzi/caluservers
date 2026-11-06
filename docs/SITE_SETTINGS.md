# Ajustes PRO del sitio

## Modelos Prisma

- `SiteSetting` (`key`, `value` JSONB): branding, theme, content, sections, seo, chrome, mobile_nav, contact, social, visibility, appearance.
- `CatalogConfig` (`id=default`, `payload` JSONB): planes web/vps/dedicated + ubicaciones.

Migraciones:

1. `20261106120000_site_settings`
2. `20261106140000_catalog_config`

Aplicar **manualmente** en tu entorno: `npx prisma migrate deploy` (o `db push` en desarrollo). No se ejecutan contra producción desde este PR.

## API (admin + `trustedWrite` en POST)

- `GET|POST /api/admin/site-settings` — body `{ settings }` o `{ action: "restore" }`
- `GET|POST /api/admin/catalog` — body `{ catalog }` o `{ action: "restore" }`

Sin sesión → 401. Origen no confiable en POST → 403.

## Validación

- URLs de assets/redes/compra: solo `https` (sin `javascript:`, `data:`, credenciales en URL).
- Enlaces CTA/nav: allowlist de rutas internas, `whmcs`, o https.
- Textos: plano sin `<`/`>`.
- Colores: `#RGB` / `#RRGGBB`.
- Tipografías: conjunto cerrado (`system`, `sora-montserrat`, `exo-sora`, `inter`).

## UI

`/admin/site` → Estudio PRO: Branding, Apariencia, Contenido, Secciones (orden ▲▼), Catálogo, SEO, Navegación, Vista previa. Indicador de cambios sin guardar y publicación unificada.

WHMCS API cifrada permanece en `/admin/settings`.
