// Cliente de Supabase — solo se crea si están las variables de entorno.
// Sin ellas la web pública usa los datos semilla (src/lib/catalog.ts) y el
// panel /admin muestra un aviso en lugar de fingir un login.
// Variables (Vercel → Settings → Environment Variables):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;

/** Nombres de las tablas del panel (ver supabase/schema.sql). */
export const TABLES = {
  plans: "calu_plans",
  locations: "calu_locations",
  settings: "calu_settings",
  admins: "calu_admins",
} as const;
