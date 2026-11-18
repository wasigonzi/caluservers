/**
 * i18n ES/EN (Fase 5, frente B). Módulo PURO (sin next/headers): lo usan
 * tanto el servidor (lib/i18n/server.ts) como los tests.
 *
 * Alcance: portal del cliente y rutas públicas principales (navegación y
 * base de conocimientos); el admin queda en español con las claves
 * principales. Los textos legales (Términos/Privacidad/AUP) NO se
 * traducen: siguen en español con aviso de que la versión en inglés
 * está pendiente.
 *
 * Resolución de idioma: cookie `calu-locale` (visitantes) o preferencia
 * User.locale (clientes con sesión). Sin traducción de un contenido de BD,
 * se sirve el español (ver lib/content-kb.ts: resolveLocalized).
 */
import { es, type Dictionary } from "./es";
import { en } from "./en";

export type { Dictionary };
export type Locale = "es" | "en";

export const LOCALES: Locale[] = ["es", "en"];
export const LOCALE_COOKIE = "calu-locale";

export const dictionaries: Record<Locale, Dictionary> = { es, en };

export function normalizeLocale(value: unknown): Locale {
  return value === "en" ? "en" : "es";
}

export function getDictionary(locale: unknown): Dictionary {
  return dictionaries[normalizeLocale(locale)];
}

/** Acceso por ruta de claves ("portal.dashboard"). */
export function t(locale: unknown, path: string): string {
  const dict = getDictionary(locale) as unknown as Record<string, unknown>;
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object") return path;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : path;
}
