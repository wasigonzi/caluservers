import { NextRequest, NextResponse } from "next/server";
import { PAGE_PATHS } from "@/lib/page-content";
import { getPageContent } from "@/lib/page-content-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET público: solo payload de textos (sin secretos). */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "/";
  if (!PAGE_PATHS.includes(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const payload = await getPageContent(path);
  return NextResponse.json(
    { path, payload },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
