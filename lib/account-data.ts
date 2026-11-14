import "server-only";
import { redirect } from "next/navigation";
import { customerSession } from "@/lib/customer-session";
import { db } from "@/lib/db";
import { whmConfiguration } from "@/lib/whm";
import { provisionConfiguration } from "@/lib/whm-provision";

/** Sesión del cliente o redirección a la entrada. Sin verificación de correo. */
export async function requireCustomer() {
  const session = await customerSession();
  if (!session?.user) redirect("/cuenta/entrar");
  return session.user;
}

export type AccountBadges = { facturas: number; tickets: number };

/** Pendientes del cliente: facturas por pagar y tickets con respuesta de soporte. */
export async function accountBadges(userId: string): Promise<AccountBadges> {
  try {
    const [facturas, tickets] = await Promise.all([
      db.customerInvoice.count({ where: { userId, status: "issued" } }),
      db.supportTicket.count({ where: { userId, status: "answered" } }),
    ]);
    return { facturas, tickets };
  } catch {
    return { facturas: 0, tickets: 0 };
  }
}

/**
 * Dirección de acceso a cPanel, deducida del servidor WHM configurado en el panel.
 * cPanel escucha en el puerto 2083 del mismo host. Sin servidor configurado no hay enlace.
 */
export async function cpanelLoginUrl(): Promise<string | null> {
  const candidates = await Promise.all([
    provisionConfiguration().then((c) => c.url).catch(() => ""),
    whmConfiguration().then((c) => c.url).catch(() => ""),
  ]);
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const host = new URL(candidate).hostname;
      if (host) return `https://${host}:2083`;
    } catch {
      // Una URL guardada que no se puede leer no produce enlace.
    }
  }
  return null;
}

export const ACCOUNT_LABELS = {
  order: { submitted: "Recibido", paid: "Pagado", cancelled: "Cancelado" } as Record<string, string>,
};
