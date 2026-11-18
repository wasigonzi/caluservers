import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";
import { pageNumber } from "@/lib/admin-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SEVERITIES = new Set(["info", "warning", "critical"]);

/**
 * GET /api/admin/alerts — lista de alertas con filtros por leída/no
 * leída (`read=all|read|unread`) y severidad (`severity`), 50 por
 * página (`p`). Con `?unread=1` devuelve solo `{ unread }`, el contador
 * que usa el menú del panel. Exige el permiso `audit:view`.
 *
 * POST /api/admin/alerts — `{ action: "mark-read", id }` marca una
 * alerta como leída; `{ action: "mark-all-read" }` marca todas las no
 * leídas. Exige `audit:view` y origen de confianza.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("audit:view");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  try {
    if (params.get("unread") === "1") {
      const unread = await db.alert.count({ where: { readAt: null } });
      return NextResponse.json({ unread });
    }
    const where: { readAt?: { not: null } | null; severity?: string } = {};
    const read = params.get("read") ?? "all";
    if (read === "read") where.readAt = { not: null };
    if (read === "unread") where.readAt = null;
    const severity = params.get("severity") ?? "";
    if (SEVERITIES.has(severity)) where.severity = severity;
    const total = await db.alert.count({ where });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = pageNumber(params.get("p") ?? undefined, pages);
    const alerts = await db.alert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return NextResponse.json({
      alerts: alerts.map((alert) => ({
        id: alert.id,
        ruleKey: alert.ruleKey,
        severity: alert.severity,
        title: alert.title,
        body: alert.body,
        resourceType: alert.resourceType,
        resourceId: alert.resourceId,
        readAt: alert.readAt?.toISOString() ?? null,
        createdAt: alert.createdAt.toISOString(),
      })),
      total,
      page,
      pages,
    });
  } catch {
    return NextResponse.json({ error: "No se pudieron leer las alertas." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await requirePermission("audit:view");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  try {
    if (action === "mark-read") {
      const id = String(body?.id || "");
      if (!id) return NextResponse.json({ error: "Falta la alerta." }, { status: 400 });
      const updated = await db.alert.update({
        where: { id },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ id: updated.id, readAt: updated.readAt?.toISOString() ?? null });
    }
    if (action === "mark-all-read") {
      const result = await db.alert.updateMany({
        where: { readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ updated: result.count });
    }
    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar la alerta." }, { status: 503 });
  }
}
