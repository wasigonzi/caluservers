import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import {
  AUDIT_LOG_PAGE_SIZE,
  buildAuditLogWhere,
} from "@/lib/audit-log";
import { db } from "@/lib/db";
import { pageNumber } from "@/lib/admin-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit-log — lista de AuditLog con los mismos filtros
 * que /admin/auditoria: actor (admin/client/system), acción (contiene),
 * recurso (contiene en tipo o id) y rango de fechas (from/to, YYYY-MM-DD).
 * Paginación de 50 por página (`p`). Exige el permiso `audit:view`.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("audit:view");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  const where = buildAuditLogWhere({
    actorType: params.get("actor") ?? undefined,
    action: params.get("action") ?? undefined,
    resource: params.get("resource") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
  try {
    const total = await db.auditLog.count({ where });
    const pages = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));
    const page = pageNumber(params.get("p") ?? undefined, pages);
    const entries = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_LOG_PAGE_SIZE,
      take: AUDIT_LOG_PAGE_SIZE,
    });
    return NextResponse.json({
      entries: entries.map((entry) => ({
        id: entry.id,
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        details: entry.details,
        createdAt: entry.createdAt.toISOString(),
      })),
      total,
      page,
      pages,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo leer la auditoría." }, { status: 503 });
  }
}
