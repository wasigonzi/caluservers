// Operaciones del panel /admin contra Supabase.
// Sin Supabase configurado todas las funciones devuelven un error claro:
// el admin NO finge logins ni guardados.
import type { Plan, SiteSettings, VpsLocation } from "./catalog";
import { SEED_CATALOG } from "./catalog";
import {
  DEFAULT_SITE_SETTINGS,
  parseSiteSettings,
  settingsToRows,
} from "./siteSettings";
import { supabase, TABLES, isSupabaseConfigured } from "./supabase";

export interface AdminUser {
  id: string;
  email?: string;
}

export interface AdminResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

const NOT_CONFIGURED =
  "Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en las variables de entorno de Vercel y aplica supabase/schema.sql en el proyecto.";

function guard(): string | null {
  return isSupabaseConfigured && supabase ? null : NOT_CONFIGURED;
}

export async function getSessionUser(): Promise<AdminUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  return { id: user.id, email: user.email };
}

export async function signIn(
  email: string,
  password: string,
): Promise<AdminResult<AdminUser>> {
  const err = guard();
  if (err || !supabase) return { ok: false, error: err ?? NOT_CONFIGURED };
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "No se pudo iniciar sesión." };
  }
  return { ok: true, data: { id: data.user.id, email: data.user.email } };
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}

export interface SignUpAdminResult {
  ok: boolean;
  /** true cuando Supabase creó la cuenta pero pide confirmarla por correo. */
  needsConfirmation: boolean;
  data?: AdminUser;
  message?: string;
  error?: string;
}

/**
 * Crea la cuenta de administrador desde el panel. Distingue tres casos:
 * sesión activa (se puede entrar ya), confirmación por correo pendiente
 * (la cuenta existe pero hay que confirmar el email) y error.
 */
export async function signUpAdmin(
  email: string,
  password: string,
): Promise<SignUpAdminResult> {
  const err = guard();
  if (err || !supabase) {
    return { ok: false, needsConfirmation: false, error: err ?? NOT_CONFIGURED };
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo:
        "https://caluservers-wasigonzi-2937s-projects.vercel.app/admin",
    },
  });
  if (error) {
    return { ok: false, needsConfirmation: false, error: error.message };
  }
  const user = data.user
    ? { id: data.user.id, email: data.user.email }
    : undefined;
  if (data.session && user) {
    return {
      ok: true,
      needsConfirmation: false,
      data: user,
      message: "Cuenta creada. Ya puedes entrar al panel.",
    };
  }
  return {
    ok: true,
    needsConfirmation: true,
    data: user,
    message:
      "Cuenta creada. Revisa tu correo para confirmar la cuenta y luego inicia sesión.",
  };
}

export async function changePassword(
  newPassword: string,
): Promise<AdminResult<void>> {
  const err = guard();
  if (err || !supabase) return { ok: false, error: err ?? NOT_CONFIGURED };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function isAdmin(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from(TABLES.admins)
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/**
 * El primer usuario que entra al admin se convierte en administrador
 * (solo si la tabla calu_admins está vacía). Los siguientes necesitan que
 * un admin existente los añada. Devuelve isAdmin del usuario.
 */
export async function ensureFirstAdmin(
  userId: string,
): Promise<AdminResult<boolean>> {
  const err = guard();
  if (err || !supabase) return { ok: false, error: err ?? NOT_CONFIGURED };
  const { count, error: countError } = await supabase
    .from(TABLES.admins)
    .select("user_id", { count: "exact", head: true });
  if (countError) {
    return {
      ok: false,
      error: `No se pudo verificar la tabla de administradores: ${countError.message}`,
    };
  }
  if ((count ?? 0) === 0) {
    const { error: insertError } = await supabase
      .from(TABLES.admins)
      .insert({ user_id: userId });
    if (insertError) {
      return {
        ok: false,
        error: `No se pudo crear el primer administrador: ${insertError.message}`,
      };
    }
    return { ok: true, data: true };
  }
  return { ok: true, data: await isAdmin(userId) };
}

interface PlanRow {
  id: string;
  category: string;
  name: string;
  price: string;
  description: string | null;
  features: string[] | null;
  location_id: string | null;
  purchase_url: string | null;
  sort_order: number | null;
  active: boolean | null;
}

function rowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    category: (row.category === "web" || row.category === "dedicated"
      ? row.category
      : "vps") as Plan["category"],
    name: row.name,
    price: row.price,
    description: row.description ?? "",
    features: Array.isArray(row.features) ? row.features : [],
    locationId: row.location_id ?? "",
    purchaseUrl: row.purchase_url ?? "",
    sortOrder: row.sort_order ?? 0,
    active: row.active ?? true,
  };
}

function planToRow(plan: Plan): Record<string, unknown> {
  return {
    id: plan.id,
    category: plan.category,
    name: plan.name,
    price: plan.price,
    description: plan.description,
    features: plan.features,
    location_id: plan.locationId || null,
    purchase_url: plan.purchaseUrl || null,
    sort_order: plan.sortOrder,
    active: plan.active,
  };
}

export async function fetchPlansAdmin(): Promise<AdminResult<Plan[]>> {
  const err = guard();
  if (err || !supabase) return { ok: false, error: err ?? NOT_CONFIGURED };
  const { data, error } = await supabase
    .from(TABLES.plans)
    .select("*")
    .order("category")
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: ((data as PlanRow[]) ?? []).map(rowToPlan) };
}

export async function savePlanAdmin(
  plan: Plan,
): Promise<AdminResult<Plan>> {
  const err = guard();
  if (err || !supabase) return { ok: false, error: err ?? NOT_CONFIGURED };
  const { data, error } = await supabase
    .from(TABLES.plans)
    .upsert(planToRow(plan), { onConflict: "id" })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: rowToPlan(data as PlanRow) };
}

export async function deletePlanAdmin(
  id: string,
): Promise<AdminResult<void>> {
  const err = guard();
  if (err || !supabase) return { ok: false, error: err ?? NOT_CONFIGURED };
  const { error } = await supabase.from(TABLES.plans).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

interface LocationRow {
  id: string;
  name: string;
  city: string;
  flag: string | null;
  badge: string | null;
  enabled: boolean | null;
  sort_order: number | null;
}

function rowToLocation(row: LocationRow): VpsLocation {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    flag: row.flag ?? "",
    badge: row.badge ?? "",
    enabled: row.enabled ?? true,
    sortOrder: row.sort_order ?? 0,
  };
}

export async function fetchLocationsAdmin(): Promise<
  AdminResult<VpsLocation[]>
> {
  const err = guard();
  if (err || !supabase) return { ok: false, error: err ?? NOT_CONFIGURED };
  const { data, error } = await supabase
    .from(TABLES.locations)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: ((data as LocationRow[]) ?? []).map(rowToLocation) };
}

export async function saveLocationAdmin(
  loc: VpsLocation,
): Promise<AdminResult<VpsLocation>> {
  const err = guard();
  if (err || !supabase) return { ok: false, error: err ?? NOT_CONFIGURED };
  const { data, error } = await supabase
    .from(TABLES.locations)
    .upsert(
      {
        id: loc.id,
        name: loc.name,
        city: loc.city,
        flag: loc.flag,
        badge: loc.badge,
        enabled: loc.enabled,
        sort_order: loc.sortOrder,
      },
      { onConflict: "id" },
    )
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: rowToLocation(data as LocationRow) };
}

export async function fetchSettingsAdmin(): Promise<
  AdminResult<SiteSettings>
> {
  const err = guard();
  if (err || !supabase) return { ok: false, error: err ?? NOT_CONFIGURED };
  const { data, error } = await supabase
    .from(TABLES.settings)
    .select("key, value");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: parseSiteSettings(
      data as { key: string; value: unknown }[] | null,
      SEED_CATALOG.settings,
    ),
  };
}

export async function saveSettingsAdmin(
  settings: SiteSettings,
): Promise<AdminResult<void>> {
  const err = guard();
  if (err || !supabase) return { ok: false, error: err ?? NOT_CONFIGURED };
  const rows = settingsToRows(settings);
  const { error } = await supabase
    .from(TABLES.settings)
    .upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export { DEFAULT_SITE_SETTINGS };
