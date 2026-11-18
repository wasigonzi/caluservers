import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requireAdmin, requirePermission } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";
import { WhmError, safeWhmError } from "@/lib/whm-security";
export function whmJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
/**
 * Guarda de las rutas WHM (Fase 1, tramo D — RBAC).
 * Sin `permission`, exige solo sesión de admin (comportamiento anterior).
 * Con `permission`, exige ese permiso: sin sesión 401; con sesión pero sin
 * el permiso, 403 (el evento `authz.denied` lo escribe requirePermission).
 */
export async function whmGuard(req: NextRequest, write: boolean, permission?: string) {
  try {
    if (permission) await requirePermission(permission);
    else await requireAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError)
      return whmJson({ error: "Sin permiso." }, 403);
    return whmJson({ error: "No autorizado." }, 401);
  }
  if (write && !trustedWrite(req))
    return whmJson({ error: "Origen no permitido." }, 403);
  return null;
}
export async function whmBody(req: NextRequest): Promise<unknown> {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new WhmError("invalid");
  const reader = req.body?.getReader();
  if (!reader) throw new WhmError("invalid");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new WhmError("invalid");
      }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new WhmError("invalid");
  }
}
export function whmFailure(error: unknown) {
  const safe = safeWhmError(error);
  const status =
    safe.code === "invalid" ||
    safe.code === "identity" ||
    safe.code === "blocked"
      ? 400
      : safe.code === "pending"
        ? 409
        : 502;
  return whmJson({ error: safe.message, code: safe.code }, status);
}
