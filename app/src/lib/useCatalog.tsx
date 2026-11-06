// Catálogo con origen Supabase (cuando está configurado) o datos semilla.
// La web pública nunca se ve rota sin Supabase: siempre hay catálogo.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Catalog, Plan, VpsLocation } from "./catalog";
import { SEED_CATALOG } from "./catalog";
import { parseSiteSettings } from "./siteSettings";
import { supabase, TABLES, isSupabaseConfigured } from "./supabase";

export interface CatalogState {
  catalog: Catalog;
  source: "seed" | "supabase";
  loading: boolean;
}

const CatalogContext = createContext<CatalogState>({
  catalog: SEED_CATALOG,
  source: "seed",
  loading: false,
});

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

interface LocationRow {
  id: string;
  name: string;
  city: string;
  flag: string | null;
  badge: string | null;
  enabled: boolean | null;
  sort_order: number | null;
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

// Una sola promesa en caché por sesión: todas las páginas comparten la carga.
let catalogPromise: Promise<Catalog | null> | null = null;

async function loadCatalogFromSupabase(): Promise<Catalog | null> {
  if (!supabase) return null;
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const [plansRes, locsRes, settingsRes] = await Promise.all([
        supabase
          .from(TABLES.plans)
          .select("*")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from(TABLES.locations)
          .select("*")
          .order("sort_order", { ascending: true }),
        supabase.from(TABLES.settings).select("key, value"),
      ]);
      if (plansRes.error || locsRes.error || settingsRes.error) return null;
      const plans = (plansRes.data as PlanRow[] | null ?? []).map(rowToPlan);
      const locations = (locsRes.data as LocationRow[] | null ?? []).map(
        rowToLocation,
      );
      const settings = parseSiteSettings(
        settingsRes.data as { key: string; value: unknown }[] | null,
        SEED_CATALOG.settings,
      );
      return {
        webHosting: plans.filter((p) => p.category === "web"),
        vps: plans.filter((p) => p.category === "vps"),
        dedicated: plans.filter((p) => p.category === "dedicated"),
        locations,
        settings,
      };
    })();
  }
  return catalogPromise;
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog>(SEED_CATALOG);
  const [source, setSource] = useState<"seed" | "supabase">("seed");
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    loadCatalogFromSupabase()
      .then((remote) => {
        if (!alive) return;
        // Solo se adopta el catálogo remoto si trae planes; si las tablas
        // están vacías o fallan, la web sigue mostrando los datos semilla.
        if (remote && remote.webHosting.length + remote.vps.length > 0) {
          setCatalog(remote);
          setSource("supabase");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<CatalogState>(
    () => ({ catalog, source, loading }),
    [catalog, source, loading],
  );
  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogState {
  return useContext(CatalogContext);
}
