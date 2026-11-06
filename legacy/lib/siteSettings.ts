// Ajustes del sitio: defaults, parseo, validación y aplicación visual.
// Se almacenan como filas key/value en calu_settings (jsonb).
// Cada campo se consume en la web pública (Home, Contact, Layout, tema CSS).
import type {
  AppearancePreset,
  SiteSettings,
  ThemeSettings,
} from "./catalog";
import { SEED_CATALOG } from "./catalog";

export type { AppearancePreset, SiteSettings };

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

export function parseSiteSettings(
  rows: { key: string; value: unknown }[] | null | undefined,
  base: SiteSettings = DEFAULT_SITE_SETTINGS,
): SiteSettings {
  const settings: SiteSettings = structuredClone(base);

  for (const row of rows ?? []) {
    if (row.key === "whmcs" && typeof row.value === "string") {
      settings.whmcs = row.value;
    } else if (row.key === "site_branding") {
      const b = asObject(row.value);
      if (b) {
        settings.theme.primary = str(b.primaryColor, settings.theme.primary);
        settings.theme.secondary = str(b.secondaryColor, settings.theme.secondary);
        settings.theme.background = str(b.backgroundColor, settings.theme.background);
        settings.content.heroEyebrow = str(b.eyebrow, settings.content.heroEyebrow);
        settings.content.heroTitle = str(b.heading, settings.content.heroTitle) + " " + str(b.subtitle, "");
        settings.content.heroTitleAccent = str(b.highlight, settings.content.heroTitleAccent);
        settings.contact.email = str(b.contactEmail, settings.contact.email);
        settings.whmcs = str(b.customerPortalUrl, settings.whmcs);
        settings.content.footerBlurb = str(b.footerText, settings.content.footerBlurb);
      }
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
          contactLead: str(obj.contactLead, settings.content.contactLead),
          footerBlurb: str(obj.footerBlurb, settings.content.footerBlurb),
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
        };
      }
    } else if (row.key === "appearance") {
      const obj = asObject(row.value);
      const preset = obj?.preset;
      if (preset === "default" || preset === "ocean" || preset === "midnight") {
        settings.appearance = { preset };
      }
    }
  }
  return settings;
}

export function settingsToRows(
  settings: SiteSettings,
): { key: string; value: unknown }[] {
  return [
    { key: "whmcs", value: settings.whmcs },
    { key: "theme", value: settings.theme },
    { key: "network_status", value: settings.networkStatus },
    { key: "contact", value: settings.contact },
    { key: "social", value: settings.social },
    { key: "content", value: settings.content },
    { key: "visibility", value: settings.visibility },
    { key: "appearance", value: settings.appearance },
  ];
}

const URL_RE = /^https?:\/\/.+/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSiteSettings(settings: SiteSettings): string | null {
  if (!settings.whmcs.trim() || !URL_RE.test(settings.whmcs.trim())) {
    return "La URL de WHMCS debe ser un enlace http(s) válido.";
  }
  if (!settings.networkStatus.trim()) {
    return "El estado de la red no puede estar vacío.";
  }
  if (settings.contact.email && !EMAIL_RE.test(settings.contact.email)) {
    return "El email de contacto no es válido.";
  }
  for (const [label, url] of [
    ["X / Twitter", settings.social.x],
    ["Facebook", settings.social.facebook],
    ["LinkedIn", settings.social.linkedin],
    ["Discord", settings.social.discord],
  ] as const) {
    if (url.trim() && !URL_RE.test(url.trim())) {
      return `El enlace de ${label} debe ser http(s) o quedar vacío.`;
    }
  }
  if (!settings.content.heroTitle.trim() || !settings.content.heroLead.trim()) {
    return "El título y el texto del hero son obligatorios.";
  }
  if (
    !settings.content.heroCtaPrimary.trim() ||
    !settings.content.heroCtaSecondary.trim()
  ) {
    return "Las etiquetas de los CTA del hero son obligatorias.";
  }
  return null;
}

/** Aplica colores del tema a las CSS variables existentes del sitio. */
export function applySiteTheme(settings: SiteSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const { theme, appearance } = settings;
  root.dataset.appearance = appearance.preset;
  root.style.setProperty("--calu-cyan", theme.primary);
  root.style.setProperty("--calu-turquoise", theme.secondary);
  root.style.setProperty("--calu-luminous", theme.primary);
  root.style.setProperty("--bg", theme.background);
  root.style.setProperty("--calu-white", theme.text);
  root.style.setProperty("--calu-btn-gradient", theme.gradient);
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
