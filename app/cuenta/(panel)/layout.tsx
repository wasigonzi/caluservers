import type { Metadata } from "next";
import { cookies } from "next/headers";
import AccountShell from "@/components/account/AccountShell";
import { accountBadges, requireCustomer } from "@/lib/account-data";
import { db } from "@/lib/db";
import { normalizeLocale } from "@/lib/i18n";
import { parseSiteSettings } from "@/lib/site-settings";
import {
  normalizePortalDensity,
  resolvePortalTheme,
} from "@/lib/portal-theme";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Mi cuenta", template: "%s · Mi cuenta CaluServers" },
  robots: { index: false, follow: false },
};

export default async function AccountPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  const badges = await accountBadges(user.id);
  // Preferencias guardadas del cliente (con caída segura si la BD o la
  // migración no están: diseño por defecto + densidad cómoda + español).
  let prefs = { locale: "es", portalTheme: "default", portalDensity: "comfortable" };
  let defaultPreset: unknown = "default";
  try {
    const [row, appearance] = await Promise.all([
      db.user.findUnique({
        where: { id: user.id },
        select: { locale: true, portalTheme: true, portalDensity: true },
      }),
      db.siteSetting.findUnique({ where: { key: "appearance" } }),
    ]);
    if (row) {
      prefs = {
        locale: row.locale || "es",
        portalTheme: row.portalTheme || "default",
        portalDensity: row.portalDensity || "comfortable",
      };
    }
    if (appearance) {
      defaultPreset = parseSiteSettings([{ key: "appearance", value: appearance.value }]).appearance.preset;
    }
  } catch {
    // Caída a los valores por defecto.
  }
  // La cookie de idioma explícita manda; si no hay cookie, la preferencia
  // guardada en la cuenta.
  const cookieValue = (await cookies()).get("calu-locale")?.value;
  const locale = normalizeLocale(cookieValue ?? prefs.locale);
  return (
    <AccountShell
      name={user.name}
      email={user.email}
      badges={badges}
      portalTheme={resolvePortalTheme(prefs.portalTheme, defaultPreset)}
      portalDensity={normalizePortalDensity(prefs.portalDensity)}
      locale={locale}
    >
      {children}
    </AccountShell>
  );
}
