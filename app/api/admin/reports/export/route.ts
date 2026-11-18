import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { agingToCsv, getAgingReport, getRevenueReport, revenueToCsv } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exportación CSV de informes (Fase 6). Mismo permiso que la página
 * /admin/informes: reports:view. Sin él, 403.
 * kind=aging → antigüedad de facturas vencidas impagas por tramo.
 * kind=revenue → ingresos por mes (12 meses) y por producto.
 */
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "aging" && kind !== "revenue") {
    return new Response(JSON.stringify({ error: "kind debe ser aging o revenue." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    await requirePermission("reports:view");
  } catch {
    return new Response(JSON.stringify({ error: "Sin permiso." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  const now = new Date();
  const csv = kind === "aging" ? agingToCsv(await getAgingReport(db, now)) : revenueToCsv(await getRevenueReport(db, now));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="informe-${kind}.csv"`,
    },
  });
}
