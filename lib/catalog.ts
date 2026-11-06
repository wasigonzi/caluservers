// Catálogo semilla de CaluServers — generado desde extraction-public-config.json
// (api.php?action=public-config, 2026-11-05). NO editar a mano: regenerar.
// Dedicados: el catálogo en vivo trae 0 planes; estos 5 son los defaults del
// código original (app.js). Confirmar con el dueño si siguen vigentes.
// Precio "$0.00" (VPS New York / Normal) es un error de datos en vivo: se
// conserva tal cual y la UI lo muestra como "Consultar" (ver isPriceToConfirm).

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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/web-hosting/calu-starter",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/web-hosting/calu-professional",
      sortOrder: 1,
      active: true,
      badge: "Popular",
      featured: true,
    },
    {
      id: "wh2",
      category: "web",
      name: "Calu Business",
      price: "$9.99",
      description: "Más velocidad y potencia de procesamiento.",
      features: ["100 GB NVMe SSD", "Unlimited Websites", "Unlimited Email Accounts", "Free SSL", "cPanel", "Softaculous Premium — 250+ Scripts"],
      locationId: "us-dallas",
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/web-hosting/calu-corporate",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-miami/starter",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-miami/lite",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-miami/normal",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-miami/advanced",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-miami/deluxe",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-miami/ultimate",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-miami/mystic",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-ny/starter-1",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-ny/lite-1",
      sortOrder: 8,
      active: true,
    },
    {
      id: "plan-1793755011801",
      category: "vps",
      name: "Normal",
      price: "$0.00",
      description: "4 vCores · AMD Ryzen 9 · 8GB DDR5",
      features: ["4 vCores", "AMD Ryzen 9", "8GB DDR5", "100 GB SSD NVMe GEN 5", "Unlimited @ 10Gbps shared uplink", "IPv4 + IPv6 incluidos en el precio"],
      locationId: "us-ny",
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-ny/normal-1",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-ny/advanced-1",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-ny/deluxe-1",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-ny/ultimate-2",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-ny/mystic-1",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-dallas/starter-2",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-dallas/lite-2",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-dallas/normal",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-dallas/advanced-2",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-dallas/deluxe-2",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-dallas/ultimate-3",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-dallas/mystic-2",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-dallas/phantom",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-los-angeles/starter-3",
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
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/vps-windows-los-angeles/lite-3",
      sortOrder: 23,
      active: true,
    }
  ],
  dedicated: [
    {
      id: "ded0",
      category: "dedicated",
      name: "Dedicated Entry",
      price: "$79.99",
      description: "Intel Xeon · 8 Cores · 32 GB RAM · 2× 1 TB SSD",
      features: ["Hardware físico dedicado", "Opciones de gestión remota", "Red configurable", "Opciones de protección DDoS", "Selección de sistema operativo"],
      locationId: "",
      purchaseUrl: "https://client.caluservers.com/cart.php",
      sortOrder: 0,
      active: true,
    },
    {
      id: "ded1",
      category: "dedicated",
      name: "Dedicated Performance",
      price: "$109.99",
      description: "AMD Ryzen · 8 Cores · 64 GB RAM · 2× 1 TB NVMe",
      features: ["Hardware físico dedicado", "Opciones de gestión remota", "Red configurable", "Opciones de protección DDoS", "Selección de sistema operativo"],
      locationId: "",
      purchaseUrl: "https://client.caluservers.com/cart.php",
      sortOrder: 1,
      active: true,
    },
    {
      id: "ded2",
      category: "dedicated",
      name: "Dedicated Professional",
      price: "$149.99",
      description: "AMD Ryzen · 12 Cores · 64 GB RAM · 2× 2 TB NVMe",
      features: ["Hardware físico dedicado", "Opciones de gestión remota", "Red configurable", "Opciones de protección DDoS", "Selección de sistema operativo"],
      locationId: "",
      purchaseUrl: "https://client.caluservers.com/cart.php",
      sortOrder: 2,
      active: true,
    },
    {
      id: "ded3",
      category: "dedicated",
      name: "Dedicated Enterprise",
      price: "$219.99",
      description: "AMD EPYC · 16 Cores · 128 GB RAM · 2× 2 TB NVMe",
      features: ["Hardware físico dedicado", "Opciones de gestión remota", "Red configurable", "Opciones de protección DDoS", "Selección de sistema operativo"],
      locationId: "",
      purchaseUrl: "https://client.caluservers.com/cart.php",
      sortOrder: 3,
      active: true,
    },
    {
      id: "ded4",
      category: "dedicated",
      name: "Dedicated Ultimate",
      price: "$329.99",
      description: "AMD EPYC · 24 Cores · 256 GB RAM · 4× 2 TB NVMe",
      features: ["Hardware físico dedicado", "Opciones de gestión remota", "Red configurable", "Opciones de protección DDoS", "Selección de sistema operativo"],
      locationId: "",
      purchaseUrl: "https://client.caluservers.com/cart.php",
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
    networkStatus: "Todos los sistemas están operativos",
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
        "Nuestro equipo está listo para ayudarte con ventas, soporte técnico y preguntas de cuenta.",
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
      description: "Hosting web, VPS y servidores dedicados con infraestructura premium. Portal de clientes en WHMCS.",
      ogTitle: "CaluServers | Hosting & VPS",
      ogDescription: "Infraestructura premium para sitios, apps y cargas exigentes.",
    },
    chrome: {
      headerCtaLabel: "Comenzar",
      headerCtaHref: "/domains",
      footerCtaLabel: "Área de Cliente",
      footerCtaHref: "whmcs",
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
      { key: "client", label: "Cliente", href: "whmcs", enabled: true },
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
  { heading: "1. Acuerdo", text: "Estos Términos y Condiciones son una plantilla inicial y deben ser revisados por un asesor legal calificado y adaptados a las leyes y operaciones reales de CaluServers antes de su publicación." },
  { heading: "2. Servicios", text: "Los servicios se prestan según la descripción del producto, la confirmación del pedido y cualquier acuerdo de nivel de servicio aplicable. Las funciones, ubicaciones y disponibilidad deben confirmarse al momento de la compra." },
  { heading: "3. Facturación y pagos", text: "Las tarifas, ciclos de facturación, fechas de vencimiento, impuestos, manejo de pagos atrasados y métodos de pago aceptados deben divulgarse claramente antes de la compra. Los clientes son responsables de mantener sus datos de facturación actualizados." },
  { heading: "4. Uso aceptable", text: "Los clientes deben cumplir con la ley aplicable y la Política de Uso Aceptable. Se prohíben el abuso, la actividad maliciosa, el envío masivo no solicitado y el contenido ilegal." },
  { heading: "5. Suspensión y terminación", text: "CaluServers puede investigar reportes creíbles de abuso y tomar medidas proporcionales conforme a la ley aplicable y al acuerdo con el cliente. Pueden requerirse acciones de emergencia para proteger los sistemas y redes." },
  { heading: "6. Reembolsos y cancelaciones", text: "Publica una política clara de reembolsos y cancelaciones por producto antes de aceptar pedidos. No implies una garantía de reembolso salvo que haya sido aprobada y pueda cumplirse." },
  { heading: "7. Responsabilidad y garantías", text: "Cualquier limitación, garantía, crédito de servicio y compromiso de uptime debe indicarse en el acuerdo final con el cliente y revisarse para verificar su aplicabilidad." },
  { heading: "8. Contacto", text: "Reemplaza esta sección con tus datos verificados de contacto legal y de soporte." },
];

export const LEGAL_PRIVACY: LegalSection[] = [
  { heading: "Aviso de privacidad", text: "Describe la información personal recopilada, los fines del tratamiento, las bases legales cuando apliquen, los procesadores, los plazos de retención, las medidas de seguridad, las transferencias internacionales y los derechos de privacidad de los clientes." },
  { heading: "Entidad responsable", text: "Identifica la entidad comercial real que opera CaluServers y proporciona un contacto de privacidad verificado. Este texto es una plantilla, no una política de privacidad completa." },
];

export const LEGAL_AUP: LegalSection[] = [
  { heading: "Actividad prohibida", text: "Los clientes no pueden usar los servicios para phishing, distribución de malware, acceso no autorizado, spam, fraude, infracción de copyright, ataques de denegación de servicio u otra actividad ilegal." },
  { heading: "Integridad de la red", text: "Los clientes no deben interferir con las operaciones de red, intentar eludir los controles de seguridad ni usar los recursos de forma que perjudique a otros clientes." },
  { heading: "Reportes y aplicación", text: "Los reportes pueden enviarse a través de la página de Abuso. CaluServers debe publicar sus procedimientos de investigación, preservación de evidencia, escalamiento y apelación." },
];
