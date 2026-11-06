import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";
import {
  PAGE_DEFS,
  PAGE_PATHS,
  getPageDef,
  validatePagePayload,
} from "@/lib/page-content";
import {
  getAllPageContent,
  getPageContent,
  pageContentDbReady,
  restorePageContent,
  savePageContent,
} from "@/lib/page-content-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const path = req.nextUrl.searchParams.get("path");
  const status = await pageContentDbReady();
  if (path) {
    if (!PAGE_PATHS.includes(path)) {
      return NextResponse.json({ error: "Ruta no soportada" }, { status: 400 });
    }
    const payload = await getPageContent(path);
    return NextResponse.json(
      { path, payload, def: getPageDef(path), db: status },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const pages = await getAllPageContent();
  return NextResponse.json(
    {
      pages,
      catalog: PAGE_DEFS.map((p) => ({
        path: p.path,
        label: p.label,
        description: p.description,
        sections: [...new Set(p.fields.map((f) => f.section))],
        fields: p.fields,
      })),
      db: status,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const status = await pageContentDbReady();
  if (!status.ok) {
    return NextResponse.json(
      {
        error: status.message,
        missingMigration: status.missingMigration,
      },
      { status: 503 },
    );
  }
  try {
    const body = await req.json();
    const path = String(body?.path || "");
    if (!PAGE_PATHS.includes(path)) {
      return NextResponse.json({ error: "Ruta no soportada" }, { status: 400 });
    }
    if (body?.action === "restore") {
      const payload = await restorePageContent(path);
      return NextResponse.json({ ok: true, path, payload });
    }
    const payload = (body?.payload ?? {}) as Record<string, string>;
    const err = validatePagePayload(path, payload);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const saved = await savePageContent(path, payload);
    return NextResponse.json({ ok: true, path, payload: saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const dbFail =
      /P1001|P1017|P2021|Can't reach database|ECONNREFUSED|timeout/i.test(msg);
    return NextResponse.json(
      {
        ok: false,
        error: dbFail
          ? `BD no disponible — guardado rechazado (no es éxito): ${msg.slice(0, 160)}`
          : msg,
      },
      { status: dbFail ? 503 : 400 },
    );
  }
}
