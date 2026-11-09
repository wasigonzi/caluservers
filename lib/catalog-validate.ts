import type { Catalog, Plan, PlanCategory, VpsLocation } from "./catalog";
import { SEED_CATALOG } from "./catalog";
import { isHttpsUrl, isPlainText } from "@/lib/safe-links";

export type CatalogPayload = Omit<Catalog, "settings">;

export function seedCatalogPayload(): CatalogPayload {
  const { settings: _s, ...rest } = structuredClone(SEED_CATALOG);
  return rest;
}

function parsePlan(raw: unknown, fallbackCategory: PlanCategory): Plan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const price = typeof o.price === "string" ? o.price.trim() : "";
  const description = typeof o.description === "string" ? o.description : "";
  const purchaseUrl = typeof o.purchaseUrl === "string" ? o.purchaseUrl.trim() : "";
  const locationId = typeof o.locationId === "string" ? o.locationId : "";
  const category =
    o.category === "web" || o.category === "vps" || o.category === "dedicated"
      ? o.category
      : fallbackCategory;
  if (!id || !name) return null;
  if (!isPlainText(name, 80) || !isPlainText(description, 400)) return null;
  if (price && !isPlainText(price, 24)) return null;
  if (!isHttpsUrl(purchaseUrl, { allowEmpty: true })) return null;
  const features = Array.isArray(o.features)
    ? o.features
        .filter((f): f is string => typeof f === "string")
        .map((f) => f.trim())
        .filter(Boolean)
        .slice(0, 24)
    : [];
  if (features.some((f) => !isPlainText(f, 120))) return null;
  const priceWas =
    typeof o.priceWas === "string" && o.priceWas.trim()
      ? o.priceWas.trim()
      : undefined;
  if (priceWas && !isPlainText(priceWas, 24)) return null;
  const badge =
    typeof o.badge === "string" && o.badge.trim() ? o.badge.trim() : undefined;
  if (badge && !isPlainText(badge, 24)) return null;
  return {
    id: id.slice(0, 64),
    category,
    name,
    price: price.slice(0, 24),
    priceWas,
    description,
    features,
    locationId: locationId.slice(0, 64),
    purchaseUrl,
    sortOrder: Number.isFinite(Number(o.sortOrder)) ? Number(o.sortOrder) : 0,
    active: o.active !== false,
    badge,
    featured: o.featured === true,
  };
}

function parseLocation(raw: unknown): VpsLocation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const city = typeof o.city === "string" ? o.city.trim() : "";
  if (!id || !name || !city) return null;
  if (!isPlainText(name, 80) || !isPlainText(city, 80)) return null;
  return {
    id: id.slice(0, 64),
    name,
    city,
    flag: typeof o.flag === "string" ? o.flag.slice(0, 8) : "🇺🇸",
    badge: typeof o.badge === "string" ? o.badge.slice(0, 40) : "",
    enabled: o.enabled !== false,
    sortOrder: Number.isFinite(Number(o.sortOrder)) ? Number(o.sortOrder) : 0,
  };
}

export function parseCatalogPayload(raw: unknown): CatalogPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const webHosting = Array.isArray(o.webHosting)
    ? o.webHosting.map((p) => parsePlan(p, "web")).filter(Boolean)
    : [];
  const vps = Array.isArray(o.vps)
    ? o.vps.map((p) => parsePlan(p, "vps")).filter(Boolean)
    : [];
  const dedicated = Array.isArray(o.dedicated)
    ? o.dedicated.map((p) => parsePlan(p, "dedicated")).filter(Boolean)
    : [];
  const locations = Array.isArray(o.locations)
    ? o.locations.map(parseLocation).filter(Boolean)
    : [];
  if (!webHosting.length && !vps.length && !dedicated.length) return null;
  return {
    webHosting: webHosting as Plan[],
    vps: vps as Plan[],
    dedicated: dedicated as Plan[],
    locations: locations as VpsLocation[],
  };
}

export function validateCatalogPayload(payload: CatalogPayload): string | null {
  const all = [...payload.webHosting, ...payload.vps, ...payload.dedicated];
  const ids = new Set<string>();
  for (const plan of all) {
    if (ids.has(plan.id)) return `ID de plan duplicado: ${plan.id}`;
    ids.add(plan.id);
    if (plan.purchaseUrl && !isHttpsUrl(plan.purchaseUrl, { allowEmpty: false })) {
      return `URL de compra inválida en ${plan.name}`;
    }
  }
  return null;
}
