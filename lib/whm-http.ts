import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
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
export async function whmGuard(req: NextRequest, write: boolean) {
  try {
    await requireAdmin();
  } catch {
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
