import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, type Locale } from "./index";

/**
 * Idioma de la petición: cookie `calu-locale`. El portal del cliente
 * combina esto con User.locale en el layout de /cuenta (la preferencia
 * guardada manda cuando no hay cookie explícita).
 */
export async function getRequestLocale(): Promise<Locale> {
  try {
    const value = (await cookies()).get(LOCALE_COOKIE)?.value;
    return normalizeLocale(value);
  } catch {
    return "es";
  }
}

/** Opciones de la cookie persistente de idioma (1 año, mismo sitio). */
export const localeCookieOptions = {
  path: "/",
  maxAge: 365 * 24 * 3600,
  sameSite: "lax" as const,
};
