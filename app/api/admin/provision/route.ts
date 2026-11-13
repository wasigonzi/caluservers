import { NextRequest } from "next/server";
import {
  provisionConfiguration,
  saveProvisionConfiguration,
} from "@/lib/whm-provision";
import { whmBody, whmFailure, whmGuard, whmJson } from "@/lib/whm-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Configuración del alta automática. Admin + mismo origen en la escritura. */
export async function GET(req: NextRequest) {
  const denied = await whmGuard(req, false);
  if (denied) return denied;
  try {
    return whmJson(await provisionConfiguration());
  } catch (error) {
    return whmFailure(error);
  }
}

export async function POST(req: NextRequest) {
  const denied = await whmGuard(req, true);
  if (denied) return denied;
  try {
    return whmJson(await saveProvisionConfiguration(await whmBody(req)));
  } catch (error) {
    return whmFailure(error);
  }
}
