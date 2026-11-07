import { NextRequest } from "next/server";
import { whmConfiguration, saveWhmConfiguration } from "@/lib/whm";
import { whmGuard, whmBody, whmJson, whmFailure } from "@/lib/whm-http";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const denied = await whmGuard(req, false);
  if (denied) return denied;
  try {
    return whmJson(await whmConfiguration());
  } catch (error) {
    return whmFailure(error);
  }
}
export async function POST(req: NextRequest) {
  const denied = await whmGuard(req, true);
  if (denied) return denied;
  try {
    return whmJson(await saveWhmConfiguration(await whmBody(req)));
  } catch (error) {
    return whmFailure(error);
  }
}
