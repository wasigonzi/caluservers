-- CaluServers — esquema Supabase para el panel /admin.
-- Aplicar en el SQL Editor del proyecto Supabase ANTES de sembrar (seed.sql).
-- Auth: Supabase Auth (email/contraseña). El primer usuario que entra al
-- admin se convierte en administrador (la app inserta su user_id en
-- calu_admins solo si la tabla está vacía).

create table if not exists public.calu_plans (
  id text primary key,
  category text not null check (category in ('web', 'vps', 'dedicated')),
  name text not null,
  price text not null default '',
  description text not null default '',
  features jsonb not null default '[]'::jsonb,
  location_id text not null default '',
  purchase_url text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calu_locations (
  id text primary key,
  name text not null,
  city text not null,
  flag text not null default '',
  badge text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.calu_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.calu_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

alter table public.calu_plans enable row level security;
alter table public.calu_locations enable row level security;
alter table public.calu_settings enable row level security;
alter table public.calu_admins enable row level security;

-- Lectura pública (la web muestra el catálogo sin login).
drop policy if exists "calu_plans_read" on public.calu_plans;
create policy "calu_plans_read" on public.calu_plans
  for select using (true);

drop policy if exists "calu_locations_read" on public.calu_locations;
create policy "calu_locations_read" on public.calu_locations
  for select using (true);

drop policy if exists "calu_settings_read" on public.calu_settings;
create policy "calu_settings_read" on public.calu_settings
  for select using (true);

-- Un usuario autenticado puede ver la lista de admins (solo UUIDs, sin emails)
-- para que la app pueda comprobar si la tabla está vacía (primer admin).
drop policy if exists "calu_admins_read" on public.calu_admins;
create policy "calu_admins_read" on public.calu_admins
  for select to authenticated using (true);

-- El primer admin se crea solo cuando la tabla está vacía.
drop policy if exists "calu_admins_first_insert" on public.calu_admins;
create policy "calu_admins_first_insert" on public.calu_admins
  for insert to authenticated
  with check (not exists (select 1 from public.calu_admins));

-- Escritura solo para administradores registrados en calu_admins.
drop policy if exists "calu_plans_write_admin" on public.calu_plans;
create policy "calu_plans_write_admin" on public.calu_plans
  for all to authenticated
  using (exists (select 1 from public.calu_admins where user_id = auth.uid()))
  with check (exists (select 1 from public.calu_admins where user_id = auth.uid()));

drop policy if exists "calu_locations_write_admin" on public.calu_locations;
create policy "calu_locations_write_admin" on public.calu_locations
  for all to authenticated
  using (exists (select 1 from public.calu_admins where user_id = auth.uid()))
  with check (exists (select 1 from public.calu_admins where user_id = auth.uid()));

drop policy if exists "calu_settings_write_admin" on public.calu_settings;
create policy "calu_settings_write_admin" on public.calu_settings
  for all to authenticated
  using (exists (select 1 from public.calu_admins where user_id = auth.uid()))
  with check (exists (select 1 from public.calu_admins where user_id = auth.uid()));


-- ---------------------------------------------------------------------------
-- Claves documentadas en calu_settings (value jsonb). Aplicar seed o upsert
-- manual; NO requiere ALTER TABLE. Lectura pública (SELECT) + escritura admin.
-- IMPORTANTE (Postgres RLS): UPDATE necesita también política SELECT.
-- ---------------------------------------------------------------------------
-- whmcs            string   URL del portal WHMCS (compras / área cliente)
-- network_status   string   Texto del topbar
-- theme            object   {primary,secondary,background,panel,text,gradient}
-- contact          object   {email,phone,hours} — Contacto + footer
-- social           object   {x,facebook,linkedin,discord} — footer si no vacío
-- content          object   textos hero/CTA/contacto/footer
-- visibility       object   flags booleanos de secciones homepage
-- appearance       object   {preset: default|ocean|midnight}
--
-- Ejemplo de upsert seguro (ejecutar en SQL Editor tras schema.sql):
-- insert into public.calu_settings (key, value) values
--   ('contact', '{"email":"soporte@caluservers.com","phone":"","hours":"Soporte 24/7 por ticket"}'::jsonb),
--   ('social', '{"x":"","facebook":"","linkedin":"","discord":""}'::jsonb),
--   ('content', '{"heroEyebrow":"Alojamiento de próxima generación","heroTitle":"Impulsando tu","heroTitleAccent":"mundo digital.","heroLead":"…","heroCtaPrimary":"Ver Hosting →","heroCtaSecondary":"Ver VPS","contactLead":"…","footerBlurb":"Soporte 24/7 por ticket, en inglés y español."}'::jsonb),
--   ('visibility', '{"trustStrip":true,"steps":true,"compare":true,"locations":true,"whyUs":true,"faq":true}'::jsonb),
--   ('appearance', '{"preset":"default"}'::jsonb)
-- on conflict (key) do update set value = excluded.value, updated_at = now();
