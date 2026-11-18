import { NextRequest } from "next/server";
import { whmGuard, whmJson } from "@/lib/whm-http";
export async function POST(req: NextRequest) {
  // Ruta heredada que siempre responde 410: nunca escribe, basta `whm:read`.
  const denied = await whmGuard(req, true, "whm:read");
  if (denied) return denied;
  return whmJson(
    {
      error:
        "Configuración anterior retirada. Usa /api/admin/whm/settings; los datos históricos se conservan.",
    },
    410,
  );
}
