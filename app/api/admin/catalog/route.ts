import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";
import {
  getCatalogPayload,
  restoreCatalogPayload,
  saveCatalogPayload,
} from "@/lib/catalog-db";
import { seedCatalogPayload } from "@/lib/catalog-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const catalog = await getCatalogPayload();
  return NextResponse.json(
    { catalog, defaults: seedCatalogPayload() },
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
  try {
    const body = await req.json();
    if (body?.action === "restore") {
      const catalog = await restoreCatalogPayload();
      return NextResponse.json({ ok: true, catalog });
    }
    const catalog = await saveCatalogPayload(body?.catalog ?? body);
    return NextResponse.json({ ok: true, catalog });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
