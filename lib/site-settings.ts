import type {
  AppearancePreset,
  BrandingSettings,
  ChromeSettings,
  DensityToken,
  HomeSection,
  HomeSectionId,
  MobileNavItem,
  SafeFontId,
  SeoSettings,
  SiteSettings,
  SurfaceToken,
  ThemeSettings,
} from "./catalog";
import { SEED_CATALOG } from "./catalog";
import {
  isHexColor,
  isHttpsUrl,
  isPlainText,
  isSafeHref,
} from "./safe-links";

export type {
  AppearancePreset,
  BrandingSettings,
  ChromeSettings,
  DensityToken,
  HomeSection,
  HomeSectionId,
  MobileNavItem,
  SafeFontId,
  SeoSettings,
  SiteSettings,
  SurfaceToken,
  ThemeSettings,
};

export const DEFAULT_THEME: ThemeSettings = {
  ...SEED_CATALOG.settings.theme,
};

export const APPEARANCE_PRESETS: Record<
  AppearancePreset,
  { label: string; theme: ThemeSettings }
> = {
  default: {
    label: "Cian Calu (por defecto)",
    theme: { ...SEED_CATALOG.settings.theme },
  },
  ocean: {
    label: "Azul océano",
    theme: {
      primary: "#007BFF",
      secondary: "#00B8D9",
      background: "#06101c",
      panel: "#0a1628",
      text: "#F4F4F4",
      gradient: "linear-gradient(105deg,#007BFF 0%,#00B8D9 60%,#00E5FF 100%)",
    },
  },
  midnight: {
    label: "Medianoche",
    theme: {
      primary: "#00F0EE",
      secondary: "#4da3ff",
      background: "#04080f",
      panel: "#0a101c",
      text: "#eef6ff",
      gradient: "linear-gradient(105deg,#00F0EE 0%,#4da3ff 55%,#007BFF 100%)",
    },
  },
};

export const SAFE_FONTS: Record<
  SafeFontId,
  { label: string; css: string; heading: string; body: string }
> = {
  system: {
    label: "System UI",
    css: "system-ui,Segoe UI,Roboto,sans-serif",
    heading: "system-ui,Segoe UI,Roboto,sans-serif",
    body: "system-ui,Segoe UI,Roboto,sans-serif",
  },
  "sora-montserrat": {
    label: "Sora (títulos) + Montserrat (cuerpo)",
    css: "'Montserrat',system-ui,sans-serif",
    heading: "'Sora',system-ui,sans-serif",
    body: "'Montserrat',system-ui,sans-serif",
  },
  "exo-sora": {
    label: "Exo 2 (títulos) + Sora (cuerpo)",
    css: "'Sora',system-ui,sans-serif",
    heading: "'Exo 2',system-ui,sans-serif",
    body: "'Sora',system-ui,sans-serif",
  },
  inter: {
    label: "Inter (títulos y cuerpo)",
    css: "'Inter',system-ui,sans-serif",
    heading: "'Inter',system-ui,sans-serif",
    body: "'Inter',system-ui,sans-serif",
  },
  "playfair-source": {
    label: "Playfair Display + Source Sans 3",
    css: "'Source Sans 3',system-ui,sans-serif",
    heading: "'Playfair Display',Georgia,serif",
    body: "'Source Sans 3',system-ui,sans-serif",
  },
  "dm-sans-ibm": {
    label: "DM Sans + IBM Plex Sans",
    css: "'IBM Plex Sans',system-ui,sans-serif",
    heading: "'DM Sans',system-ui,sans-serif",
    body: "'IBM Plex Sans',system-ui,sans-serif",
  },
};

export const SECTION_LABELS: Record<HomeSectionId, string> = {
  hero: "Hero",
  trustStrip: "Franja de confianza",
  services: "Servicios",
  steps: "Pasos",
  compare: "Comparativa",
  featuredPlans: "Planes destacados",
  locations: "Ubicaciones",
  whyUs: "Infraestructura / por qué nosotros",
  faq: "FAQ",
  cta: "CTA final",
};

export const DEFAULT_SECTIONS: HomeSection[] = structuredClone(
  SEED_CATALOG.settings.sections,
);

export const DEFAULT_SITE_SETTINGS: SiteSettings = structuredClone(
  SEED_CATALOG.settings,
);

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function syncVisibilityFromSections(settings: SiteSettings): void {
  const map = Object.fromEntries(
    settings.sections.map((s) => [s.id, s.enabled]),
  ) as Partial<Record<HomeSectionId, boolean>>;
  settings.visibility = {
    trustStrip: map.trustStrip ?? settings.visibility.trustStrip,
    steps: map.steps ?? settings.visibility.steps,
    compare: map.compare ?? settings.visibility.compare,
    locations: map.locations ?? settings.visibility.locations,
    whyUs: map.whyUs ?? settings.visibility.whyUs,
    faq: map.faq ?? settings.visibility.faq,
    featuredPlans: map.featuredPlans ?? settings.visibility.featuredPlans,
    cta: map.cta ?? settings.visibility.cta,
    services: map.services ?? settings.visibility.services,
  };
}

export function parseSiteSettings(
  rows: { key: string; value: unknown }[] | null | undefined,
  base: SiteSettings = DEFAULT_SITE_SETTINGS,
): SiteSettings {
  const settings: SiteSettings = structuredClone(base);

  for (const row of rows ?? []) {
    if (row.key === "whmcs" && typeof row.value === "string") {
      settings.whmcs = row.value;
    } else if (row.key === "network_status" && typeof row.value === "string") {
      settings.networkStatus = row.value;
    } else if (row.key === "theme") {
      const obj = asObject(row.value);
      if (obj) {
        settings.theme = {
          ...settings.theme,
          ...(obj as Partial<ThemeSettings>),
        };
      }
    } else if (row.key === "contact") {
      const obj = asObject(row.value);
      if (obj) {
        settings.contact = {
          email: str(obj.email, settings.contact.email),
          phone: str(obj.phone, settings.contact.phone),
          hours: str(obj.hours, settings.contact.hours),
        };
      }
    } else if (row.key === "social") {
      const obj = asObject(row.value);
      if (obj) {
        settings.social = {
          x: str(obj.x, settings.social.x),
          facebook: str(obj.facebook, settings.social.facebook),
          linkedin: str(obj.linkedin, settings.social.linkedin),
          discord: str(obj.discord, settings.social.discord),
        };
      }
    } else if (row.key === "content") {
      const obj = asObject(row.value);
      if (obj) {
        settings.content = {
          ...settings.content,
          heroEyebrow: str(obj.heroEyebrow, settings.content.heroEyebrow),
          heroTitle: str(obj.heroTitle, settings.content.heroTitle),
          heroTitleAccent: str(
            obj.heroTitleAccent,
            settings.content.heroTitleAccent,
          ),
          heroLead: str(obj.heroLead, settings.content.heroLead),
          heroCtaPrimary: str(
            obj.heroCtaPrimary,
            settings.content.heroCtaPrimary,
          ),
          heroCtaSecondary: str(
            obj.heroCtaSecondary,
            settings.content.heroCtaSecondary,
          ),
          heroCtaPrimaryHref: str(
            obj.heroCtaPrimaryHref,
            settings.content.heroCtaPrimaryHref,
          ),
          heroCtaSecondaryHref: str(
            obj.heroCtaSecondaryHref,
            settings.content.heroCtaSecondaryHref,
          ),
          contactLead: str(obj.contactLead, settings.content.contactLead),
          footerBlurb: str(obj.footerBlurb, settings.content.footerBlurb),
          servicesKicker: str(
            obj.servicesKicker,
            settings.content.servicesKicker,
          ),
          servicesTitle: str(obj.servicesTitle, settings.content.servicesTitle),
          servicesLead: str(obj.servicesLead, settings.content.servicesLead),
          featuredKicker: str(
            obj.featuredKicker,
            settings.content.featuredKicker,
          ),
          featuredTitle: str(obj.featuredTitle, settings.content.featuredTitle),
          featuredLead: str(obj.featuredLead, settings.content.featuredLead),
          ctaKicker: str(obj.ctaKicker, settings.content.ctaKicker),
          ctaTitle: str(obj.ctaTitle, settings.content.ctaTitle),
          ctaLead: str(obj.ctaLead, settings.content.ctaLead),
          ctaButtonLabel: str(
            obj.ctaButtonLabel,
            settings.content.ctaButtonLabel,
          ),
          ctaButtonHref: str(obj.ctaButtonHref, settings.content.ctaButtonHref),
        };
      }
    } else if (row.key === "visibility") {
      const obj = asObject(row.value);
      if (obj) {
        settings.visibility = {
          trustStrip: bool(obj.trustStrip, settings.visibility.trustStrip),
          steps: bool(obj.steps, settings.visibility.steps),
          compare: bool(obj.compare, settings.visibility.compare),
          locations: bool(obj.locations, settings.visibility.locations),
          whyUs: bool(obj.whyUs, settings.visibility.whyUs),
          faq: bool(obj.faq, settings.visibility.faq),
          featuredPlans: bool(
            obj.featuredPlans,
            settings.visibility.featuredPlans,
          ),
          cta: bool(obj.cta, settings.visibility.cta),
          services: bool(obj.services, settings.visibility.services),
        };
      }
    } else if (row.key === "appearance") {
      const obj = asObject(row.value);
      const preset = obj?.preset;
      if (preset === "default" || preset === "ocean" || preset === "midnight") {
        settings.appearance.preset = preset;
      }
      const font = obj?.font;
      if (
        font === "system" ||
        font === "sora-montserrat" ||
        font === "exo-sora" ||
        font === "inter" ||
        font === "playfair-source" ||
        font === "dm-sans-ibm"
      ) {
        settings.appearance.font = font;
      }
      const radius = obj?.radius;
      if (radius === "sm" || radius === "md" || radius === "lg") {
        settings.appearance.radius = radius;
      }
      const shadow = obj?.shadow;
      if (shadow === "soft" || shadow === "medium" || shadow === "strong") {
        settings.appearance.shadow = shadow;
      }
      const density = obj?.density;
      if (
        density === "compact" ||
        density === "comfortable" ||
        density === "relaxed"
      ) {
        settings.appearance.density = density;
      } else if (!settings.appearance.density) {
        settings.appearance.density = "comfortable";
      }
      const surface = obj?.surface;
      if (surface === "solid" || surface === "glass" || surface === "mesh") {
        settings.appearance.surface = surface;
      } else if (!settings.appearance.surface) {
        settings.appearance.surface = "glass";
      }
    } else if (row.key === "branding") {
      const obj = asObject(row.value);
      if (obj) {
        settings.branding = {
          siteName: str(obj.siteName, settings.branding.siteName),
          tagline: str(obj.tagline, settings.branding.tagline),
          logoUrl: str(obj.logoUrl, settings.branding.logoUrl),
          logoMobileUrl: str(obj.logoMobileUrl, settings.branding.logoMobileUrl),
          faviconUrl: str(obj.faviconUrl, settings.branding.faviconUrl),
          ogImageUrl: str(obj.ogImageUrl, settings.branding.ogImageUrl),
        };
      }
    } else if (row.key === "seo") {
      const obj = asObject(row.value);
      if (obj) {
        settings.seo = {
          title: str(obj.title, settings.seo.title),
          description: str(obj.description, settings.seo.description),
          ogTitle: str(obj.ogTitle, settings.seo.ogTitle),
          ogDescription: str(obj.ogDescription, settings.seo.ogDescription),
        };
      }
    } else if (row.key === "chrome") {
      const obj = asObject(row.value);
      if (obj) {
        settings.chrome = {
          headerCtaLabel: str(
            obj.headerCtaLabel,
            settings.chrome.headerCtaLabel,
          ),
          headerCtaHref: str(obj.headerCtaHref, settings.chrome.headerCtaHref),
          footerCtaLabel: str(
            obj.footerCtaLabel,
            settings.chrome.footerCtaLabel,
          ),
          footerCtaHref: str(obj.footerCtaHref, settings.chrome.footerCtaHref),
          clientAreaLabel: str(
            obj.clientAreaLabel,
            settings.chrome.clientAreaLabel,
          ),
          showNetworkStatus: bool(
            obj.showNetworkStatus,
            settings.chrome.showNetworkStatus,
          ),
        };
      }
    } else if (row.key === "sections" && Array.isArray(row.value)) {
      const parsed: HomeSection[] = [];
      const seen = new Set<string>();
      for (const item of row.value) {
        const obj = asObject(item);
        if (!obj) continue;
        const id = obj.id;
        if (
          typeof id === "string" &&
          id in SECTION_LABELS &&
          !seen.has(id)
        ) {
          seen.add(id);
          parsed.push({
            id: id as HomeSectionId,
            enabled: bool(obj.enabled, true),
          });
        }
      }
      // Completar ids faltantes al final
      for (const def of DEFAULT_SECTIONS) {
        if (!seen.has(def.id)) parsed.push({ ...def });
      }
      if (parsed.length) settings.sections = parsed;
    } else if (row.key === "mobile_nav" && Array.isArray(row.value)) {
      const items: MobileNavItem[] = [];
      for (const item of row.value.slice(0, 6)) {
        const obj = asObject(item);
        if (!obj) continue;
        const key = str(obj.key, "");
        const label = str(obj.label, "");
        const href = str(obj.href, "");
        if (!key || !label) continue;
        items.push({
          key: key.slice(0, 32),
          label: label.slice(0, 24),
          href,
          enabled: bool(obj.enabled, true),
        });
      }
      if (items.length) settings.mobileNav = items;
    }
  }

  syncVisibilityFromSections(settings);
  return settings;
}

export function settingsToRows(
  settings: SiteSettings,
): { key: string; value: unknown }[] {
  syncVisibilityFromSections(settings);
  return [
    { key: "whmcs", value: settings.whmcs },
    { key: "theme", value: settings.theme },
    { key: "network_status", value: settings.networkStatus },
    { key: "contact", value: settings.contact },
    { key: "social", value: settings.social },
    { key: "content", value: settings.content },
    { key: "visibility", value: settings.visibility },
    { key: "appearance", value: settings.appearance },
    { key: "branding", value: settings.branding },
    { key: "seo", value: settings.seo },
    { key: "chrome", value: settings.chrome },
    { key: "sections", value: settings.sections },
    { key: "mobile_nav", value: settings.mobileNav },
  ];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSiteSettings(settings: SiteSettings): string | null {
  if (!contrastOk(settings.theme.background, settings.theme.text)) {
    return "Contraste insuficiente entre fondo y texto (mín. 4.5:1).";
  }

  if (!isHttpsUrl(settings.whmcs, { allowEmpty: false })) {
    return "La URL de WHMCS debe ser https válida.";
  }
  if (!settings.networkStatus.trim() || !isPlainText(settings.networkStatus, 120)) {
    return "Estado de red inválido (texto plano, máx. 120).";
  }
  if (settings.contact.email && !EMAIL_RE.test(settings.contact.email)) {
    return "El email de contacto no es válido.";
  }
  if (!isPlainText(settings.contact.phone, 40) || !isPlainText(settings.contact.hours, 80)) {
    return "Teléfono u horario contienen caracteres no permitidos.";
  }
  for (const [label, url] of [
    ["X / Twitter", settings.social.x],
    ["Facebook", settings.social.facebook],
    ["LinkedIn", settings.social.linkedin],
    ["Discord", settings.social.discord],
  ] as const) {
    if (url.trim() && !isHttpsUrl(url)) {
      return `El enlace de ${label} debe ser https o vacío.`;
    }
  }
  const b = settings.branding;
  if (!b.siteName.trim() || !isPlainText(b.siteName, 60)) {
    return "Nombre de marca inválido.";
  }
  if (!isPlainText(b.tagline, 120)) return "Tagline inválido.";
  for (const [label, url] of [
    ["Logo", b.logoUrl],
    ["Logo móvil", b.logoMobileUrl],
    ["Favicon", b.faviconUrl],
    ["Imagen OG", b.ogImageUrl],
  ] as const) {
    if (url.trim() && !isHttpsUrl(url)) {
      return `${label}: solo URLs https (o vacío para el recurso por defecto).`;
    }
  }
  const theme = settings.theme;
  for (const [label, color] of [
    ["Primario", theme.primary],
    ["Acento", theme.secondary],
    ["Fondo", theme.background],
    ["Panel", theme.panel],
    ["Texto", theme.text],
  ] as const) {
    if (!isHexColor(color)) return `Color ${label} debe ser #RGB o #RRGGBB.`;
  }
  if (!theme.gradient.includes("gradient") || /[<>]/.test(theme.gradient)) {
    return "Gradiente inválido.";
  }
  if (!settings.content.heroTitle.trim() || !settings.content.heroLead.trim()) {
    return "El título y el texto del hero son obligatorios.";
  }
  const plainFields: [string, string, number][] = [
    ["heroEyebrow", settings.content.heroEyebrow, 80],
    ["heroTitle", settings.content.heroTitle, 80],
    ["heroTitleAccent", settings.content.heroTitleAccent, 80],
    ["heroLead", settings.content.heroLead, 400],
    ["heroCtaPrimary", settings.content.heroCtaPrimary, 40],
    ["heroCtaSecondary", settings.content.heroCtaSecondary, 40],
    ["contactLead", settings.content.contactLead, 300],
    ["footerBlurb", settings.content.footerBlurb, 200],
    ["servicesTitle", settings.content.servicesTitle, 120],
    ["ctaTitle", settings.content.ctaTitle, 120],
    ["seo.title", settings.seo.title, 70],
    ["seo.description", settings.seo.description, 160],
    ["seo.ogTitle", settings.seo.ogTitle, 70],
    ["seo.ogDescription", settings.seo.ogDescription, 160],
  ];
  for (const [label, value, max] of plainFields) {
    if (!isPlainText(value, max)) {
      return `Campo ${label}: texto plano sin HTML (máx. ${max}).`;
    }
  }
  for (const [label, href] of [
    ["CTA hero primario", settings.content.heroCtaPrimaryHref],
    ["CTA hero secundario", settings.content.heroCtaSecondaryHref],
    ["CTA final", settings.content.ctaButtonHref],
    ["Header CTA", settings.chrome.headerCtaHref],
    ["Footer CTA", settings.chrome.footerCtaHref],
  ] as const) {
    if (!isSafeHref(href)) {
      return `${label}: usa una ruta interna permitida, "whmcs" o https.`;
    }
  }
  if (!settings.sections.length) return "Debe haber al menos una sección.";
  if (settings.mobileNav.length < 2 || settings.mobileNav.length > 6) {
    return "La navegación móvil debe tener entre 2 y 6 ítems.";
  }
  for (const item of settings.mobileNav) {
    if (!isPlainText(item.label, 24)) return "Etiqueta de nav móvil inválida.";
    if (!isSafeHref(item.href)) {
      return `Destino de nav «${item.label}» no permitido.`;
    }
  }
  return null;
}

export function contrastOk(bg: string, fg: string): boolean {
  const hex = (h: string) => {
    const x = h.replace("#", "").trim();
    if (!/^[0-9a-fA-F]{6}$/.test(x)) return null;
    const n = (i: number) => parseInt(x.slice(i, i + 2), 16) / 255;
    const lin = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const [r, g, b] = [n(0), n(2), n(4)].map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const L1 = hex(bg);
  const L2 = hex(fg);
  if (L1 == null || L2 == null) return true;
  const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  return ratio >= 4.5;
}

export function applySiteTheme(settings: SiteSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const { theme, appearance } = settings;
  const font = SAFE_FONTS[appearance.font] ?? SAFE_FONTS["sora-montserrat"];
  root.dataset.appearance = appearance.preset;
  root.dataset.font = appearance.font;
  root.dataset.radius = appearance.radius;
  root.dataset.shadow = appearance.shadow;
  root.dataset.density = appearance.density || "comfortable";
  root.dataset.surface = appearance.surface || "glass";
  root.style.setProperty("--calu-cyan", theme.primary);
  root.style.setProperty("--calu-turquoise", theme.secondary);
  root.style.setProperty("--calu-luminous", theme.primary);
  root.style.setProperty("--bg", theme.background);
  root.style.setProperty("--calu-white", theme.text);
  root.style.setProperty("--calu-btn-gradient", theme.gradient);
  root.style.setProperty("--calu-font", font.body);
  root.style.setProperty("--calu-font-heading", font.heading);
  const radiusMap = { sm: "12px", md: "20px", lg: "28px" };
  root.style.setProperty("--radius-lg", radiusMap[appearance.radius]);
  const densityMap = {
    compact: "0.92",
    comfortable: "1",
    relaxed: "1.08",
  } as const;
  root.style.setProperty(
    "--calu-density",
    densityMap[appearance.density || "comfortable"],
  );
}

export function socialEntries(
  social: SiteSettings["social"],
): { label: string; href: string }[] {
  const entries: { label: string; href: string }[] = [];
  if (social.x.trim()) entries.push({ label: "X", href: social.x.trim() });
  if (social.facebook.trim())
    entries.push({ label: "Facebook", href: social.facebook.trim() });
  if (social.linkedin.trim())
    entries.push({ label: "LinkedIn", href: social.linkedin.trim() });
  if (social.discord.trim())
    entries.push({ label: "Discord", href: social.discord.trim() });
  return entries;
}

export function logoSrc(branding: BrandingSettings, mobile = false): string {
  if (mobile) {
    return (
      branding.logoMobileUrl.trim() ||
      branding.logoUrl.trim() ||
      "/assets/logo-principal.svg"
    );
  }
  return branding.logoUrl.trim() || "/assets/logo-principal.svg";
}
