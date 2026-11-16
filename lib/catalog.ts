// Catálogo semilla de CaluServers — generado desde extraction-public-config.json
// (api.php?action=public-config, 2026-11-05). NO editar a mano: regenerar.
// Dedicados: el catálogo en vivo trae 0 planes; estos 5 son los defaults del
// código original (app.js). Confirmar con el dueño si siguen vigentes.
// Precios de hosting y VPS contrastados el 2026-11-09 con las páginas públicas
// de grupo de la tienda (no con el checkout). New York / Normal figura en vivo
// como «Consultar»: su precio es a confirmar por el dueño (auditoría 2026-11-15),
// por eso lleva "$0.00" y no un precio inventado. Los dedicados no aparecen:
// dedicated y dedicated-servers redirigen a web hosting, así que no llevan
// precio ni botón de pedido.
// Compra: el portal canónico es el área propia /cuenta. Cada purchaseUrl
// apunta a /cuenta/contratar?plan=<id>; ningún botón de pedido enlaza ya al
// portal anterior (client.caluservers.com). El campo settings.whmcs se
// conserva solo como base del carrito de registro de dominios, que aún no
// tiene flujo propio (ver DomainsPage).

export type PlanCategory = "web" | "vps" | "dedicated";

export interface Plan {
  id: string;
  category: PlanCategory;
  name: string;
  price: string;
  /** Precio tachado opcional (oferta). */
  priceWas?: string;
  description: string;
  features: string[];
  locationId: string;
  purchaseUrl: string;
  sortOrder: number;
  active: boolean;
  /** Etiqueta corta visible en la tarjeta (ej. Popular). */
  badge?: string;
  /** Destaca el plan en home / listados. */
  featured?: boolean;
}

export interface VpsLocation {
  id: string;
  name: string;
  city: string;
  flag: string;
  badge: string;
  enabled: boolean;
  sortOrder: number;
}

export interface ThemeSettings {
  primary: string;
  secondary: string;
  background: string;
  panel: string;
  text: string;
  gradient: string;
}

export type AppearancePreset = "default" | "ocean" | "midnight";

export interface SiteContact {
  email: string;
  phone: string;
  hours: string;
}

export interface SiteSocial {
  x: string;
  facebook: string;
  linkedin: string;
  discord: string;
}

export interface SiteVisibility {
  trustStrip: boolean;
  steps: boolean;
  compare: boolean;
  locations: boolean;
  whyUs: boolean;
  faq: boolean;
  /** Sección de planes destacados en home. */
  featuredPlans: boolean;
  /** CTA final de home. */
  cta: boolean;
  /** Bloque de servicios (hosting/vps/dedicados). */
  services: boolean;
}

export type SafeFontId =
  | "system"
  | "sora-montserrat"
  | "exo-sora"
  | "inter"
  | "playfair-source"
  | "dm-sans-ibm";
export type RadiusToken = "sm" | "md" | "lg";
export type ShadowToken = "soft" | "medium" | "strong";
export type DensityToken = "compact" | "comfortable" | "relaxed";
export type SurfaceToken = "solid" | "glass" | "mesh";

export interface SiteAppearance {
  preset: AppearancePreset;
  /** Pareja tipográfica heading/body segura (no CSS arbitrario). */
  font: SafeFontId;
  radius: RadiusToken;
  shadow: ShadowToken;
  density: DensityToken;
  surface: SurfaceToken;
}

export interface BrandingSettings {
  siteName: string;
  tagline: string;
  /** URL https del logo; vacío = /assets/logo-principal.svg */
  logoUrl: string;
  /** Logo compacto / móvil; vacío = logo principal o monograma */
  logoMobileUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
}

export interface SeoSettings {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
}

export interface ChromeSettings {
  headerCtaLabel: string;
  /** Ruta interna permitida o https */
  headerCtaHref: string;
  footerCtaLabel: string;
  footerCtaHref: string;
  clientAreaLabel: string;
  showNetworkStatus: boolean;
}

export type HomeSectionId =
  | "hero"
  | "trustStrip"
  | "services"
  | "steps"
  | "compare"
  | "featuredPlans"
  | "locations"
  | "whyUs"
  | "faq"
  | "cta";

export interface HomeSection {
  id: HomeSectionId;
  enabled: boolean;
}

export interface MobileNavItem {
  key: string;
  label: string;
  /** Ruta interna, "whmcs" o https permitido */
  href: string;
  enabled: boolean;
}

export interface SiteContent {
  heroEyebrow: string;
  heroTitle: string;
  heroTitleAccent: string;
  heroLead: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  /** Destino CTA primario: ruta interna o https */
  heroCtaPrimaryHref: string;
  heroCtaSecondaryHref: string;
  contactLead: string;
  footerBlurb: string;
  servicesKicker: string;
  servicesTitle: string;
  servicesLead: string;
  featuredKicker: string;
  featuredTitle: string;
  featuredLead: string;
  ctaKicker: string;
  ctaTitle: string;
  ctaLead: string;
  ctaButtonLabel: string;
  ctaButtonHref: string;
}

export interface SiteSettings {
  whmcs: string;
  theme: ThemeSettings;
  networkStatus: string;
  contact: SiteContact;
  social: SiteSocial;
  content: SiteContent;
  visibility: SiteVisibility;
  appearance: SiteAppearance;
  branding: BrandingSettings;
  seo: SeoSettings;
  chrome: ChromeSettings;
  /** Orden y activación de secciones home (fuente de verdad; visibility se sincroniza). */
  sections: HomeSection[];
  mobileNav: MobileNavItem[];
}

export interface Catalog {
  webHosting: Plan[];
  vps: Plan[];
  dedicated: Plan[];
  locations: VpsLocation[];
  settings: SiteSettings;
}

/** Un precio "$0.00" en los datos significa "precio a confirmar", nunca $0. */
export function isPriceToConfirm(price: string): boolean {
  const p = price.trim();
  return p === "$0.00" || p === "$0" || p === "";
}

export const SEED_CATALOG: Catalog = {
  webHosting: [
    {
      id: "wh0",
      category: "web",
      name: "Calu Starter",
      price: "$3.99",
      description: "Cuando solo necesitas un sitio.",
      features: ["20 GB NVMe SSD", "1 Website", "100 Email Accounts", "Free SSL", "cPanel", "Softaculous Premium — 250+ Scripts"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=wh0",
      sortOrder: 0,
      active: true,
    },
    {
      id: "wh1",
      category: "web",
      name: "Calu Professional",
      price: "$6.99",
      priceWas: "$9.99",
      description: "Perfecto para múltiples sitios.",
      features: ["50 GB NVMe SSD", "Sitios web ilimitados", "Unlimited Email Accounts", "Free SSL", "cPanel", "Softaculous Premium — 250+ Scripts"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=wh1",
      sortOrder: 1,
      active: true,
      badge: "Popular",
      featured: true,
    },
    {
      id: "wh2",
      category: "web",
      name: "Business",
      price: "$9.99",
      description: "Más velocidad y potencia de procesamiento.",
      features: ["100 GB NVMe SSD", "Unlimited Websites", "Unlimited Email Accounts", "Free SSL", "cPanel", "Softaculous Premium — 250+ Scripts"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=wh2",
      sortOrder: 2,
      active: true,
    }
  ],
  vps: [
    {
      id: "plan-1793754336742",
      category: "vps",
      name: "Starter",
      price: "$6.99",
      featured: true,
      badge: "Más vendido",
      description: "1 vCore · AMD Ryzen 9 9950X · 2GB DDR5 5600 MHz",
      features: ["1 vCore", "AMD Ryzen 9 9950X", "2GB DDR5 5600 MHz", "20 GB SSD NVMe GEN 5", "5TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-miami",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793754336742",
      sortOrder: 0,
      active: true,
    },
    {
      id: "plan-1793754407361",
      category: "vps",
      name: "Lite",
      price: "$9.99",
      description: "2 vCores · AMD Ryzen 9 · 4GB DDR5",
      features: ["2 vCores", "AMD Ryzen 9", "4GB DDR5", "50 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps shared uplink", "IPv4 incluida en el precio"],
      locationId: "us-miami",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793754407361",
      sortOrder: 1,
      active: true,
    },
    {
      id: "plan-1793754470256",
      category: "vps",
      name: "Normal",
      price: "$16.99",
      description: "4 vCores · AMD Ryzen 9 · 8GB DDR5",
      features: ["4 vCores", "AMD Ryzen 9", "8GB DDR5", "100 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps shared uplink", "IPv4 incluida en el precio"],
      locationId: "us-miami",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793754470256",
      sortOrder: 2,
      active: true,
    },
    {
      id: "plan-1793754497934",
      category: "vps",
      name: "Advanced",
      price: "$31.99",
      description: "6 vCores · AMD Ryzen 9 · 12GB DDR5",
      features: ["6 vCores", "AMD Ryzen 9", "12GB DDR5", "128 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps shared uplink", "IPv4 incluida en el precio"],
      locationId: "us-miami",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793754497934",
      sortOrder: 3,
      active: true,
    },
    {
      id: "plan-1793754783518",
      category: "vps",
      name: "Deluxe",
      price: "$42.99",
      description: "8 vCores · AMD Ryzen 9 · 16GB DDR4/5",
      features: ["8 vCores", "AMD Ryzen 9", "16GB DDR4/5", "150 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps Shared Uplink", "IPv4 incluida en el precio"],
      locationId: "us-miami",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793754783518",
      sortOrder: 4,
      active: true,
    },
    {
      id: "plan-1793754810824",
      category: "vps",
      name: "Ultimate",
      price: "$61.99",
      description: "12 vCores · AMD Ryzen 9 · 24GB DDR4/5",
      features: ["12 vCores", "AMD Ryzen 9", "24GB DDR4/5", "256 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps Shared Uplink", "IPv4 incluida en el precio"],
      locationId: "us-miami",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793754810824",
      sortOrder: 5,
      active: true,
    },
    {
      id: "plan-1793754834484",
      category: "vps",
      name: "Mystic",
      price: "$81.99",
      description: "16 vCores · AMD Ryzen 9 · 32GB DDR4/5",
      features: ["16 vCores", "AMD Ryzen 9", "32GB DDR4/5", "512 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps shared uplink", "IPv4 incluida en el precio"],
      locationId: "us-miami",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793754834484",
      sortOrder: 6,
      active: true,
    },
    {
      id: "plan-1793754945886",
      category: "vps",
      name: "Starter",
      price: "$3.99",
      description: "1 vCore · AMD Ryzen 9 · 2GB DDR5",
      features: ["1 vCore", "AMD Ryzen 9", "2GB DDR5", "20 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-ny",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793754945886",
      sortOrder: 7,
      active: true,
    },
    {
      id: "plan-1793754989658",
      category: "vps",
      name: "Lite",
      price: "$6.99",
      description: "2 vCores · AMD Ryzen 9 · 4GB DDR5",
      features: ["2 vCores", "AMD Ryzen 9", "4GB DDR5", "50 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-ny",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793754989658",
      sortOrder: 8,
      active: true,
    },
    {
      id: "plan-1793755011801",
      category: "vps",
      name: "Normal",
      // Precio a confirmar por el dueño: en vivo figura como «Consultar»
      // (auditoría 2026-11-15). "$0.00" = precio a confirmar, nunca $0.
      price: "$0.00",
      description: "4 vCores · AMD Ryzen 9 · 8GB DDR5",
      features: ["4 vCores", "AMD Ryzen 9", "8GB DDR5", "100 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-ny",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755011801",
      sortOrder: 9,
      active: true,
    },
    {
      id: "plan-1793755031531",
      category: "vps",
      name: "Advanced",
      price: "$18.99",
      description: "6 vCores · AMD Ryzen 9 · 12GB DDR5",
      features: ["6 vCores", "AMD Ryzen 9", "12GB DDR5", "128 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-ny",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755031531",
      sortOrder: 10,
      active: true,
    },
    {
      id: "plan-1793755054263",
      category: "vps",
      name: "Deluxe",
      price: "$24.99",
      description: "8 vCores · AMD Ryzen 9 · 16GB DDR4/5",
      features: ["8 vCores", "AMD Ryzen 9", "16GB DDR4/5", "150 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps Shared Uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-ny",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755054263",
      sortOrder: 11,
      active: true,
    },
    {
      id: "plan-1793755083053",
      category: "vps",
      name: "Ultimate",
      price: "$36.99",
      description: "12 vCores · AMD Ryzen 9 · 24GB DDR4/5",
      features: ["12 vCores", "AMD Ryzen 9", "24GB DDR4/5", "256 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps Shared Uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-ny",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755083053",
      sortOrder: 12,
      active: true,
    },
    {
      id: "plan-1793755103930",
      category: "vps",
      name: "Mystic",
      price: "$59.99",
      description: "16 vCores · AMD Ryzen 9 · 32GB DDR4/5",
      features: ["16 vCores", "AMD Ryzen 9", "32GB DDR4/5", "512 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-ny",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755103930",
      sortOrder: 13,
      active: true,
    },
    {
      id: "plan-1793755197233",
      category: "vps",
      name: "Starter",
      price: "$1.99",
      description: "1 vCore · AMD Ryzen 9 9950X · 2GB DDR5 5600 MHz",
      features: ["1 vCore", "AMD Ryzen 9 9950X", "2GB DDR5 5600 MHz", "20 GB SSD NVMe GEN 5", "5TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755197233",
      sortOrder: 14,
      active: true,
    },
    {
      id: "plan-1793755219569",
      category: "vps",
      name: "Lite",
      price: "$3.99",
      description: "2 vCores · AMD Ryzen 9 9950X · 4GB DDR5 5600 MHz",
      features: ["2 vCores", "AMD Ryzen 9 9950X", "4GB DDR5 5600 MHz", "50 GB SSD NVMe GEN 5", "10TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755219569",
      sortOrder: 15,
      active: true,
    },
    {
      id: "plan-1793755240639",
      category: "vps",
      name: "Normal",
      price: "$7.99",
      description: "4 vCores · AMD Ryzen 9 9950X · 8GB DDR5 5600 MHz",
      features: ["4 vCores", "AMD Ryzen 9 9950X", "8GB DDR5 5600 MHz", "100 GB SSD NVMe GEN 5", "10TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755240639",
      sortOrder: 16,
      active: true,
    },
    {
      id: "plan-1793755262920",
      category: "vps",
      name: "Advanced",
      price: "$11.99",
      description: "6 vCores · AMD Ryzen 9 9950X · 12GB DDR5 5600 MHz",
      features: ["6 vCores", "AMD Ryzen 9 9950X", "12GB DDR5 5600 MHz", "128 GB SSD NVMe GEN 5", "20TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755262920",
      sortOrder: 17,
      active: true,
    },
    {
      id: "plan-1793755287580",
      category: "vps",
      name: "Deluxe",
      price: "$14.99",
      description: "8 vCores · AMD Ryzen 9 9950X · 16GB DDR5 5600 MHz",
      features: ["8 vCores", "AMD Ryzen 9 9950X", "16GB DDR5 5600 MHz", "150 GB SSD NVMe GEN 5", "35TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755287580",
      sortOrder: 18,
      active: true,
    },
    {
      id: "plan-1793755319209",
      category: "vps",
      name: "Ultimate",
      price: "$22.99",
      description: "12 vCores · AMD Ryzen 9 9950X · 24GB DDR5 5600 MHz",
      features: ["12 vCores", "AMD Ryzen 9 9950X", "24GB DDR5 5600 MHz", "256 GB SSD NVMe GEN 5", "50TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755319209",
      sortOrder: 19,
      active: true,
    },
    {
      id: "plan-1793755366561",
      category: "vps",
      name: "Mystic",
      price: "$59.99",
      description: "14 vCores · AMD Ryzen 9 9950X · 32GB DDR5 5600 MHz",
      features: ["14 vCores", "AMD Ryzen 9 9950X", "32GB DDR5 5600 MHz", "512 GB SSD NVMe GEN 5", "50TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755366561",
      sortOrder: 20,
      active: true,
    },
    {
      id: "plan-1793755386673",
      category: "vps",
      name: "Phantom",
      price: "$99.99",
      description: "16 vCores · AMD Ryzen 9 9950X · 64GB DDR5 5600 MHz",
      features: ["16 vCores", "AMD Ryzen 9 9950X", "64GB DDR5 5600 MHz", "960 GB SSD NVMe GEN 5", "50TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-dallas",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755386673",
      sortOrder: 21,
      active: true,
    },
    {
      id: "plan-1793755439840",
      category: "vps",
      name: "Starter",
      price: "$1.99",
      description: "1 vCore · AMD Ryzen 9 9950X · 2GB DDR5 5600 MHz",
      features: ["1 vCore", "AMD Ryzen 9 9950X", "2GB DDR5 5600 MHz", "20 GB SSD NVMe GEN 5", "5TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-la",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755439840",
      sortOrder: 22,
      active: true,
    },
    {
      id: "plan-1793755487341",
      category: "vps",
      name: "Lite",
      price: "$3.99",
      description: "2 vCores · AMD Ryzen 9 9950X · 4GB DDR5 5600 MHz",
      features: ["2 vCores", "AMD Ryzen 9 9950X", "4GB DDR5 5600 MHz", "50 GB SSD NVMe GEN 5", "10TB @ 1Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-la",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793755487341",
      sortOrder: 23,
      active: true,
    }
  ],
  dedicated: [
    {
      id: "ded0",
      category: "dedicated",
      name: "Dedicated Entry",
      price: "",
      description: "Referencia no publicada en la tienda. Intel Xeon · 8 Cores · 32 GB RAM · 2× 1 TB SSD",
      features: ["Hardware físico dedicado", "Opciones de gestión remota", "Red configurable", "Opciones de protección DDoS", "Selección de sistema operativo"],
      locationId: "",
      purchaseUrl: "",
      sortOrder: 0,
      active: true,
    },
    {
      id: "ded1",
      category: "dedicated",
      name: "Dedicated Performance",
      price: "",
      description: "Referencia no publicada en la tienda. AMD Ryzen · 8 Cores · 64 GB RAM · 2× 1 TB NVMe",
      features: ["Hardware físico dedicado", "Opciones de gestión remota", "Red configurable", "Opciones de protección DDoS", "Selección de sistema operativo"],
      locationId: "",
      purchaseUrl: "",
      sortOrder: 1,
      active: true,
    },
    {
      id: "ded2",
      category: "dedicated",
      name: "Dedicated Professional",
      price: "",
      description: "Referencia no publicada en la tienda. AMD Ryzen · 12 Cores · 64 GB RAM · 2× 2 TB NVMe",
      features: ["Hardware físico dedicado", "Opciones de gestión remota", "Red configurable", "Opciones de protección DDoS", "Selección de sistema operativo"],
      locationId: "",
      purchaseUrl: "",
      sortOrder: 2,
      active: true,
    },
    {
      id: "ded3",
      category: "dedicated",
      name: "Dedicated Enterprise",
      price: "",
      description: "Referencia no publicada en la tienda. AMD EPYC · 16 Cores · 128 GB RAM · 2× 2 TB NVMe",
      features: ["Hardware físico dedicado", "Opciones de gestión remota", "Red configurable", "Opciones de protección DDoS", "Selección de sistema operativo"],
      locationId: "",
      purchaseUrl: "",
      sortOrder: 3,
      active: true,
    },
    {
      id: "ded4",
      category: "dedicated",
      name: "Dedicated Ultimate",
      price: "",
      description: "Referencia no publicada en la tienda. AMD EPYC · 24 Cores · 256 GB RAM · 4× 2 TB NVMe",
      features: ["Hardware físico dedicado", "Opciones de gestión remota", "Red configurable", "Opciones de protección DDoS", "Selección de sistema operativo"],
      locationId: "",
      purchaseUrl: "",
      sortOrder: 4,
      active: true,
    }
  ],
  locations: [
    {
      id: "us-dallas",
      name: "Estados Unidos",
      city: "Dallas",
      flag: "🇺🇸",
      badge: "Recomendado",
      enabled: true,
      sortOrder: 0,
    },
    {
      id: "us-la",
      name: "Estados Unidos",
      city: "Los Angeles",
      flag: "🇺🇸",
      badge: "Oferta",
      enabled: true,
      sortOrder: 1,
    },
    {
      id: "us-ny",
      name: "Estados Unidos",
      city: "New York",
      flag: "🇺🇸",
      badge: "",
      enabled: true,
      sortOrder: 2,
    },
    {
      id: "us-miami",
      name: "Estados Unidos",
      city: "Miami",
      flag: "🇺🇸",
      badge: "",
      enabled: true,
      sortOrder: 3,
    },
    {
      id: "pl-warsaw",
      name: "Polonia",
      city: "Warsaw",
      flag: "🇵🇱",
      badge: "",
      enabled: false,
      sortOrder: 4,
    },
    {
      id: "es-madrid",
      name: "España",
      city: "Madrid",
      flag: "🇪🇸",
      badge: "",
      enabled: false,
      sortOrder: 5,
    },
    {
      id: "de-frankfurt",
      name: "Alemania",
      city: "Frankfurt",
      flag: "🇩🇪",
      badge: "",
      enabled: false,
      sortOrder: 6,
    },
    {
      id: "nl-eygelshoven",
      name: "Países Bajos",
      city: "Eygelshoven",
      flag: "🇳🇱",
      badge: "",
      enabled: false,
      sortOrder: 7,
    }
  ],
  settings: {
    whmcs: "https://client.caluservers.com",
    theme: {
      primary: "#00E5FF",
      secondary: "#00B8D9",
      background: "#070E15",
      panel: "#0b1425",
      text: "#F4F4F4",
      gradient: "linear-gradient(105deg,#00E5FF 0%,#00B8D9 55%,#0099c9 100%)",
    },
    networkStatus: "Sin monitorización automática en este sitio.",
    contact: {
      email: "soporte@caluservers.com",
      phone: "",
      hours: "Soporte 24/7 por ticket",
    },
    social: { x: "", facebook: "", linkedin: "", discord: "" },
    content: {
      heroEyebrow: "Alojamiento de próxima generación",
      heroTitle: "Impulsando tu",
      heroTitleAccent: "mundo digital.",
      heroLead:
        "Almacenamiento SSD puro, LiteSpeed con LSCache, todo desde cPanel. Incluye SSL gratis, migración gratis desde cualquier proveedor y copias diarias.",
      heroCtaPrimary: "Ver Hosting →",
      heroCtaSecondary: "Ver VPS",
      heroCtaPrimaryHref: "/web-hosting",
      heroCtaSecondaryHref: "/vps",
      contactLead:
        "Escríbenos y te respondemos al correo que indiques. El mensaje queda registrado en nuestro panel.",
      footerBlurb: "Soporte 24/7 por ticket, en inglés y español.",
      servicesKicker: "Nuestros servicios",
      servicesTitle: "Infraestructura que te impulsa hacia adelante.",
      servicesLead: "Elige la plataforma adecuada para tu sitio web, aplicación o carga de trabajo empresarial.",
      featuredKicker: "Planes destacados",
      featuredTitle: "Empieza con la configuración adecuada.",
      featuredLead: "Selección de planes marcados como destacados en el catálogo.",
      ctaKicker: "¿Estás listo?",
      ctaTitle: "Tu próximo proyecto comienza aquí.",
      ctaLead: "Encuentra un plan de alojamiento que se ajuste a tus objetivos.",
      ctaButtonLabel: "Comenzar →",
      ctaButtonHref: "/web-hosting",
    },
    visibility: {
      trustStrip: true,
      steps: true,
      compare: true,
      locations: true,
      whyUs: true,
      faq: true,
      featuredPlans: true,
      cta: true,
      services: true,
    },
    appearance: { preset: "default", font: "sora-montserrat", radius: "lg", shadow: "medium", density: "comfortable", surface: "glass" },
    branding: {
      siteName: "CaluServers",
      tagline: "Hosting • VPS • Dedicated Servers",
      logoUrl: "",
      logoMobileUrl: "",
      faviconUrl: "",
      ogImageUrl: "",
    },
    seo: {
      title: "CaluServers | Web Hosting • VPS • Dedicated",
      description: "Hosting web, VPS y servidores dedicados con infraestructura premium. Área de cliente propia en /cuenta.",
      ogTitle: "CaluServers | Hosting & VPS",
      ogDescription: "Infraestructura premium para sitios, apps y cargas exigentes.",
    },
    chrome: {
      headerCtaLabel: "Comenzar",
      headerCtaHref: "/domains",
      footerCtaLabel: "Área de Cliente",
      footerCtaHref: "/cuenta",
      clientAreaLabel: "Área de Cliente ↗",
      showNetworkStatus: true,
    },
    sections: [
      { id: "hero", enabled: true },
      { id: "trustStrip", enabled: true },
      { id: "services", enabled: true },
      { id: "steps", enabled: true },
      { id: "compare", enabled: true },
      { id: "featuredPlans", enabled: true },
      { id: "locations", enabled: true },
      { id: "whyUs", enabled: true },
      { id: "faq", enabled: true },
      { id: "cta", enabled: true },
    ],
    mobileNav: [
      { key: "home", label: "Inicio", href: "/", enabled: true },
      { key: "hosting", label: "Hosting", href: "/web-hosting", enabled: true },
      { key: "vps", label: "VPS", href: "/vps", enabled: true },
      { key: "domains", label: "Dominios", href: "/domains", enabled: true },
      { key: "client", label: "Cliente", href: "/cuenta", enabled: true },
    ],
  },
};

export const TECH_SPECS: string[] = [
  "Panel de Control cPanel",
  "Softaculous Premium",
  "CloudLinux OS",
  "Servidor Web LiteSpeed",
  "Soporte PHP de 7.4 a 8.5",
  "Librería Gráfica GD",
  "Zend Guard Loader",
  "ionCube PHP Loader",
  "ImageMagick",
  "Bases de Datos MySQL ilimitadas",
  "Editor de Zona DNS",
  "Editor Mail Exchange (MX)",
  "Terminal SSH en cPanel",
  "Multi-PHP",
  "Plugin LiteSpeed Cache",
  "Migración Gestionada Gratis",
  "Soporte cPanel ilimitado",
  "Cobertura de Soporte 24/7/365",
  "Monitoreo Proactivo del Host",
  "Constructor de Sitios SitePad Gratis",
];

export const INCLUDED_BENEFITS: { title: string; text: string }[] = [
  {
    title: "Velocidad sin extras",
    text: "Discos SSD puros, servidor web LiteSpeed y LSCache en todos los planes. No hay complementos de velocidad que comprar.",
  },
  {
    title: "SSL Let's Encrypt gratis",
    text: "Cada dominio y subdominio recibe un certificado que se renueva solo. Tus visitantes ven el candado y los formularios y pagos viajan cifrados.",
  },
  {
    title: "Garantía de 99.9% de uptime",
    text: "Vigilamos los servidores a todas horas y tu cuenta está cubierta por nuestro compromiso de 99.9% de uptime.",
  },
  {
    title: "Instalación de WordPress en 1 clic",
    text: "WordPress se instala desde cPanel con un clic, con el plugin LSCache listo para activar.",
  },
  {
    title: "Cuentas aisladas",
    text: "CageFS mantiene cada cuenta en su propio espacio. Si un sitio vecino se ve comprometido, no puede llegar a tus archivos.",
  },
  {
    title: "Garantía de devolución",
    text: "Si durante tu primer mes sientes que nuestro hosting no es para ti, te reembolsamos tus tarifas de hosting.",
  },
];

export const TLDS: string[] = [".com", ".net", ".org", ".online", ".info", ".store"];

export const ABUSE_CATEGORIES: string[] = [
  "Spam",
  "Phishing",
  "Malware",
  "Copyright / DMCA",
  "Abuso de red",
  "Fraude",
  "Otro",
];

export interface LegalSection {
  heading: string;
  text: string;
}

export const LEGAL_TERMS: LegalSection[] = [
  { heading: "1. Acuerdo", text: "Al crear una cuenta o hacer un pedido en CaluServers aceptas estos términos. Ofrecemos hosting, VPS y servidores dedicados; los precios del catálogo son los que se facturan. Titular: [dato a completar por el propietario: nombre legal, dirección y número de registro]." },
  { heading: "2. Servicios", text: "Los servicios se prestan según la descripción del producto, la confirmación del pedido y cualquier acuerdo de nivel de servicio aplicable. Las funciones, ubicaciones y disponibilidad deben confirmarse al momento de la compra." },
  { heading: "3. Facturación y pagos", text: "Las tarifas, ciclos de facturación, fechas de vencimiento, impuestos, manejo de pagos atrasados y métodos de pago aceptados deben divulgarse claramente antes de la compra. Los clientes son responsables de mantener sus datos de facturación actualizados." },
  { heading: "4. Uso aceptable", text: "Los clientes deben cumplir con la ley aplicable y la Política de Uso Aceptable. Se prohíben el abuso, la actividad maliciosa, el envío masivo no solicitado y el contenido ilegal." },
  { heading: "5. Suspensión y terminación", text: "CaluServers puede investigar reportes creíbles de abuso y tomar medidas proporcionales conforme a la ley aplicable y al acuerdo con el cliente. Pueden requerirse acciones de emergencia para proteger los sistemas y redes." },
  { heading: "6. Reembolsos y cancelaciones", text: "Hosting: reembolso del primer mes según lo publicado en el sitio. VPS, servidores dedicados y dominios no tienen garantía de devolución publicada. Cancela por ticket o a soporte@caluservers.com; cancelar en el panel no suspende ni borra por sí sola la cuenta en el servidor." },
  { heading: "7. Responsabilidad y garantías", text: "Compromiso de disponibilidad del 99,9 % publicado, sin importes de crédito publicados. Las copias diarias, el SSL y la migración están incluidos donde el plan lo indica." },
  { heading: "8. Contacto", text: "Soporte 24/7 por ticket, en inglés y español, desde tu panel del cliente. Correo: soporte@caluservers.com." },
];

export const LEGAL_PRIVACY: LegalSection[] = [
  { heading: "Aviso de privacidad", text: "Recogemos nombre, correo e imagen opcional al registrarte; plan, dominio, importe y moneda en los pedidos; importe, método y referencia en los pagos; asunto y mensajes en los tickets; y nombre, correo, tema y mensaje en los formularios de contacto y abuso. Los usamos para tu cuenta, pedidos, facturas, activación y soporte, y para protegernos contra el abuso. Se comparten con PayPal al pagar en línea, con WHM/cPanel para el alta de hosting y con el servicio de correo para los avisos." },
  { heading: "Entidad responsable", text: "Titular: [dato a completar por el propietario: nombre legal, dirección y número de registro]. Para revisar o actualizar tu perfil usa tu panel del cliente; para pedir acceso, corrección o eliminación escribe a soporte@caluservers.com." },
];

export const LEGAL_AUP: LegalSection[] = [
  { heading: "Actividad prohibida", text: "Los clientes no pueden usar los servicios para phishing, distribución de malware, acceso no autorizado, spam, fraude, infracción de copyright, ataques de denegación de servicio u otra actividad ilegal." },
  { heading: "Integridad de la red", text: "Los clientes no deben interferir con las operaciones de red, intentar eludir los controles de seguridad ni usar los recursos de forma que perjudique a otros clientes." },
  { heading: "Reportes y aplicación", text: "Los reportes se envían desde la página de Abuso o a soporte@caluservers.com. Investigamos cada reporte creíble y aplicamos medidas proporcionales: aviso, suspensión o terminación del servicio. Si tu servicio se ve afectado, puedes responder y pedir información por ticket desde tu panel del cliente." },
];
