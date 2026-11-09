# Ajustes PRO del sitio

## Modelos Prisma

- `SiteSetting` (`key`, `value` JSONB): branding, theme, content, sections, seo, chrome, mobile_nav, contact, social, visibility, appearance.
- `CatalogConfig` (`id=default`, `payload` JSONB): planes web/vps/dedicated + ubicaciones.

Migraciones:

1. `20261106120000_site_settings`
2. `20261106140000_catalog_config`
3. `20261106210000_page_content`
4. `20261109120000_integration_audit` (`IntegrationConfig`, `AdminAudit`)

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

## Subida de branding (Vercel Blob)

Endpoint: `GET|POST /api/admin/branding-upload` (admin + `trustedWrite` en POST).

### Configuración manual (no se hace desde este PR)

1. En el proyecto Vercel: **Storage → Create → Blob**, acceso **Public** (los logos deben ser visibles en la web).
2. Conecta el store al proyecto (Production / Preview / Development).
3. Local: `vercel link` y `vercel env pull` para obtener `BLOB_READ_WRITE_TOKEN` (y opcionalmente `BLOB_STORE_ID` / OIDC).
4. Reinicia `npm run dev`. Sin token, el panel muestra subida desactivada y permite URL https.

### Límites y formatos

| Slot | Máx. | Formatos (magic bytes) |
|------|------|-------------------------|
| `faviconUrl` | 2 MB | PNG, ICO |
| `logoUrl`, `logoMobileUrl`, `ogImageUrl` | 5 MB | PNG, JPEG, WebP, GIF |

- **SVG / HTML rechazados** (mensaje claro; no se sanitiza SVG).
- Extensión/MIME se deriva del **contenido**, no solo de `file.name`.
- Pathnames: `branding/<slot>/<random>.<ext>`.
- Subida &lt; ~4 MB vía `FormData` + `put()`; mayores vía client upload autenticado (`@vercel/blob/client`) por el límite de body de Functions (~4.5 MB).
- La URL se aplica en memoria/preview; **publicar** sigue siendo «Guardar y publicar».
- «Quitar / default» limpia el campo; intenta `del` del blob solo si la URL es de Vercel Blob y no queda referenciada en otros campos de branding.

No se escriben archivos en `public/` ni en el filesystem efímero de la Function.
