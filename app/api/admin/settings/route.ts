import { NextRequest } from "next/server";
import { whmGuard, whmJson } from "@/lib/whm-http";
export async function POST(req: NextRequest) {
  const denied = await whmGuard(req, true);
  if (denied) return denied;
  return whmJson(
    {
      error:
        "Configuración anterior retirada. Usa /api/admin/whm/settings; los datos históricos se conservan.",
    },
    410,
  );
}
