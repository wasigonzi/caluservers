import { NextRequest, NextResponse } from "next/server";
import { revokeCurrentSession, sessionCookie } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Revoca la sesión en BD; si la BD no responde, el borrado de la cookie
  // hace el resto (la sesión queda huérfana hasta caducar, como mucho 8 h).
  await revokeCurrentSession();
  const res = NextResponse.redirect(new URL("/admin/login", req.url), 303);
  res.cookies.delete(sessionCookie);
  return res;
}
