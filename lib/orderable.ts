import { isPriceToConfirm } from "./catalog";
import { isHttpsUrl } from "./safe-links";

/** A direct order link is a specific public store product, with a confirmed price. */
export function isOrderablePlan(plan: { price: string; purchaseUrl: string }): boolean {
  if (isPriceToConfirm(plan.price)) return false;
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
