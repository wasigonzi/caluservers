import { NextRequest } from "next/server";
import { whmRead } from "@/lib/whm";
import { WhmError } from "@/lib/whm-security";
import { whmGuard, whmBody, whmJson, whmFailure } from "@/lib/whm-http";
export const dynamic = "force-dynamic";
export const maxDuration = 40;
export async function POST(req: NextRequest) {
  const denied = await whmGuard(req, true);
  if (denied) return denied;
  try {
    const body = (await whmBody(req)) as { operation?: unknown };
    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).length !== 1 ||
      typeof body.operation !== "string" ||
      !["test", "overview", "listaccts", "listpkgs"].includes(
        String(body.operation),
      )
    )
      throw new WhmError("invalid");
    return whmJson(
      await whmRead(
        body.operation as "test" | "overview" | "listaccts" | "listpkgs",
      ),
    );
  } catch (error) {
    return whmFailure(error);
  }
}
