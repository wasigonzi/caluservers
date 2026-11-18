import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission } from "@/lib/auth";
import { PAGE_SIZE, loadFailure } from "@/lib/admin-data";
import { pageNumber, searchTerm } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { publicDomain } from "@/app/api/account/domains/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Todos los dominios, con búsqueda por dominio y paginación. RegisteredDomain
 * no tiene relación con User: los correos se resuelven aparte por userId.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("domains:view");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return json({ ok: false, error: "No tienes permiso para ver los dominios." }, 403);
    }
    return json({ ok: false, error: "Debes entrar como administrador." }, 401);
  }
  const q = searchTerm(req.nextUrl.searchParams.get("q") ?? undefined);
  let userIds: string[] | null = null;
  if (q) {
    try {
      const users = await db.user.findMany({
        where: { email: { contains: q, mode: "insensitive" } },
        select: { id: true },
        take: 100,
      });
      userIds = users.map((user) => user.id);
    } catch {
      return json({ ok: false, error: "No se pudieron cargar los dominios." }, 503);
    }
  }
  const where =
    q && userIds
      ? {
          OR: [
            { domain: { contains: q, mode: "insensitive" as const } },
            { userId: { in: userIds } },
          ],
        }
      : {};
  let domains: Awaited<ReturnType<typeof db.registeredDomain.findMany>> = [];
  let total = 0;
  let page = 1;
  let pages = 1;
  try {
    total = await db.registeredDomain.count({ where });
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = pageNumber(req.nextUrl.searchParams.get("p") ?? undefined, pages);
    domains = await db.registeredDomain.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    const users = await db.user.findMany({
      where: { id: { in: [...new Set(domains.map((domain) => domain.userId))] } },
      select: { id: true, email: true, name: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return json({
      ok: true,
      domains: domains.map((domain) => ({
        ...publicDomain(domain),
        userEmail: byId.get(domain.userId)?.email ?? null,
        userName: byId.get(domain.userId)?.name ?? null,
      })),
      total,
      page,
      pages,
    });
  } catch (error) {
    const failure = loadFailure(error, "dominios");
    return json(
      { ok: false, error: "No se pudieron cargar los dominios.", failure },
      failure === "connection" ? 503 : 500,
    );
  }
}
