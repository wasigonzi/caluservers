# Ajustes del sitio (SiteSetting)

Modelo Prisma `SiteSetting` (`key` TEXT PK, `value` JSONB).

Claves: `whmcs`, `theme`, `network_status`, `contact`, `social`, `content`, `visibility`, `appearance`.

Defaults y validación: `lib/site-settings.ts`. Carga pública: `getSiteSettings()` con fallback a defaults si la DB no está migrada.

UI admin: `/admin/site` → API `POST /api/admin/site-settings` (admin + origen confiable).

Migración: `prisma/migrations/20261106120000_site_settings/` — aplicar manualmente con `prisma migrate deploy`.
