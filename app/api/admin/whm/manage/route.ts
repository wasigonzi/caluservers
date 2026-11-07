import { NextRequest } from "next/server";
import { manageWhm } from "@/lib/whm-management";
import { whmGuard, whmBody, whmJson, whmFailure } from "@/lib/whm-http";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(req: NextRequest) {
  const denied = await whmGuard(req, true);
  if (denied) return denied;
  try {
    return whmJson(await manageWhm(await whmBody(req)));
  } catch (error) {
    return whmFailure(error);
  }
}
