import { headers } from "next/headers";
import { customerAuth, customerAuthReady } from "./customer-auth";

export async function customerSession() {
  if (!customerAuthReady) return null;
  return customerAuth.api.getSession({ headers: await headers() });
}
