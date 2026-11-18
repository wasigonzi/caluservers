/**
 * Diseño del portal del cliente (Fase 5, frente B).
 *
 * Reutiliza APPEARANCE_PRESETS de lib/site-settings.ts (default/ocean/
 * midnight): el preset por defecto del portal lo fija el admin en la
 * configuración existente (SiteSetting "appearance"); el cliente puede
 * elegir otro en su perfil y queda guardado en User.portalTheme.
 * La densidad (User.portalDensity) es la única opción extra:
 * comfortable/compact/relaxed (alto/medio/bajo en el plan).
 *
 * Módulo PURO: cada diseño se distingue de verdad — paleta, fondo,
 * radio de tarjetas y espaciado — no es solo un cambio de acento.
 */

export type PortalTheme = "default" | "ocean" | "midnight";
export type PortalDensity = "comfortable" | "compact" | "relaxed";

export const PORTAL_THEMES: PortalTheme[] = ["default", "ocean", "midnight"];
export const PORTAL_DENSITIES: PortalDensity[] = ["comfortable", "compact", "relaxed"];

export function normalizePortalTheme(value: unknown): PortalTheme {
  return (PORTAL_THEMES as readonly string[]).includes(String(value))
    ? (value as PortalTheme)
    : "default";
}

export function normalizePortalDensity(value: unknown): PortalDensity {
  return (PORTAL_DENSITIES as readonly string[]).includes(String(value))
    ? (value as PortalDensity)
    : "comfortable";
}

/**
 * Diseño efectivo: el del cliente si es válido; si no, el preset por
 * defecto del portal (admin); si tampoco, "default".
 */
export function resolvePortalTheme(
  userTheme: unknown,
  defaultPreset: unknown,
): PortalTheme {
  if ((PORTAL_THEMES as readonly string[]).includes(String(userTheme))) {
    return userTheme as PortalTheme;
  }
  if ((PORTAL_THEMES as readonly string[]).includes(String(defaultPreset))) {
    return defaultPreset as PortalTheme;
  }
  return "default";
}

/** Clases que aplica AccountShell al armazón del portal. */
export function portalThemeClasses(theme: PortalTheme, density: PortalDensity): string {
  return `portal-theme-${theme} portal-density-${density}`;
}
