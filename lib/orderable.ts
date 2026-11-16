import { isPriceToConfirm } from "./catalog";
import { isContratarUrl, isHttpsUrl } from "./safe-links";

/**
 * Un plan es pedible en el área propia cuando tiene precio confirmado y una
 * URL de compra válida. La forma canónica es la interna
 * /cuenta/contratar?plan=<id> (auditoría 2026-11-15, tareas 3+4).
 *
 * Transición: también se acepta el enlace concreto de producto de la tienda
 * anterior (…/index.php?rp=/store/<grupo>/<producto>), solo para que los
 * catálogos ya guardados en BD antes del cambio de semilla sigan siendo
 * pedibles hasta que se restauren desde la semilla. Ninguna pantalla enlaza
 * ya a esa tienda: la contratación nativa no depende de ella.
 */
export function isOrderablePlan(plan: { price: string; purchaseUrl: string }): boolean {
  if (isPriceToConfirm(plan.price)) return false;
  if (isContratarUrl(plan.purchaseUrl)) return true;
  if (!isHttpsUrl(plan.purchaseUrl, { allowEmpty: false })) return false;
  let url: URL;
  try {
    url = new URL(plan.purchaseUrl);
  } catch {
    return false;
  }
  const route = url.searchParams.get("rp") || url.pathname;
  const parts = route.split("/").filter(Boolean);
  const storeAt = parts.indexOf("store");
  return storeAt >= 0 && parts.length >= storeAt + 3;
}
