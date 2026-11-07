import { NextRequest } from "next/server";
import { whmGuard, whmJson } from "@/lib/whm-http";
export async function GET(req: NextRequest) {
  const denied = await whmGuard(req, false);
  if (denied) return denied;
  return whmJson(
    {
      error:
        "La integración WHMCS está desactivada. Usa WHM / cPanel; no se han eliminado datos anteriores.",
    },
    410,
  );
}
