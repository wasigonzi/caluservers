import { randomBytes } from "node:crypto";
import { put, del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";
import {
  BRANDING_SLOTS,
  acceptAttrForSlot,
  allowedMimesForSlot,
  isBlobConfiguredEnv,
  isBrandingSlot,
  isVercelBlobUrl,
  maxBytesForSlot,
  randomBrandingPathname,
  validateBrandingBytes,
  type BrandingSlot,
} from "@/lib/branding-upload";
import { getSiteSettings } from "@/lib/site-settings-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertAdmin() {
  try {
    await requireAdmin();
    return null;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** Estado de configuración Blob (sin secretos). */
export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;
  return NextResponse.json(
    {
      configured: isBlobConfiguredEnv(),
      slots: BRANDING_SLOTS.map((slot) => ({
        slot,
        maxBytes: maxBytesForSlot(slot),
        accept: acceptAttrForSlot(slot),
        allowedMimes: allowedMimesForSlot(slot),
      })),
      limits: {
        faviconUrl: maxBytesForSlot("faviconUrl"),
        image: maxBytesForSlot("logoUrl"),
        svg: "rejected",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * POST:
 * - multipart/form-data { file, slot [, replaceUrl] } → put() server-side
 * - application/json HandleUploadBody → client upload token (hasta 5 MB)
 * - application/json { action: "clear-blob", url } → borra blob si no está referenciado
 */
export async function POST(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";

  // Client-upload protocol (JSON from @vercel/blob/client)
  if (contentType.includes("application/json")) {
    const rawBody: unknown = await req.json();

    if (
      rawBody &&
      typeof rawBody === "object" &&
      "action" in rawBody &&
      (rawBody as { action?: string }).action === "clear-blob"
    ) {
      const raw = rawBody as { action: string; url?: string; slot?: string };
      const slot =
        typeof raw.slot === "string" && isBrandingSlot(raw.slot)
          ? raw.slot
          : undefined;
      return clearBlob(typeof raw.url === "string" ? raw.url : "", slot);
    }

    const body = rawBody as HandleUploadBody;

    if (!isBlobConfiguredEnv()) {
      return NextResponse.json(
        {
          error:
            "Vercel Blob no configurado. Define BLOB_READ_WRITE_TOKEN (o conecta un Blob store / BLOB_STORE_ID) y reinicia.",
        },
        { status: 503 },
      );
    }

    try {
      const jsonResponse = await handleUpload({
        body: body as HandleUploadBody,
        request: req,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          let slot: BrandingSlot = "logoUrl";
          try {
            const payload = clientPayload
              ? (JSON.parse(clientPayload) as { slot?: string })
              : {};
            if (payload.slot && isBrandingSlot(payload.slot)) {
              slot = payload.slot;
            }
          } catch {
            throw new Error("clientPayload inválido");
          }
          // Pathname debe vivir bajo branding/<slot>/
          if (!pathname.startsWith(`branding/${slot}/`)) {
            throw new Error("Pathname de subida no permitido.");
          }
          return {
            allowedContentTypes: allowedMimesForSlot(slot),
            maximumSizeInBytes: maxBytesForSlot(slot),
            addRandomSuffix: true,
            allowOverwrite: false,
            tokenPayload: JSON.stringify({ slot }),
          };
        },
        onUploadCompleted: async () => {
          // La publicación en SiteSetting la hace el admin con «Guardar y publicar».
        },
      });
      return NextResponse.json(jsonResponse);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Upload token error" },
        { status: 400 },
      );
    }
  }

  // Server formData upload
  if (!isBlobConfiguredEnv()) {
    return NextResponse.json(
      {
        error:
          "Vercel Blob no configurado. Define BLOB_READ_WRITE_TOKEN (o conecta un Blob store) en el entorno.",
      },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const slotRaw = String(form.get("slot") || "");
    if (!isBrandingSlot(slotRaw)) {
      return NextResponse.json({ error: "Slot de branding inválido." }, { status: 400 });
    }
    const slot = slotRaw;
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const checked = validateBrandingBytes(slot, buf);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }
    const pathname = randomBrandingPathname(
      slot,
      checked.detected.ext,
      randomBytes(12).toString("hex"),
    );
    const blob = await put(pathname, Buffer.from(buf), {
      access: "public",
      addRandomSuffix: false,
      contentType: checked.detected.mime,
    });
    return NextResponse.json({
      ok: true,
      slot,
      url: blob.url,
      contentType: checked.detected.mime,
      size: buf.byteLength,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al subir" },
      { status: 400 },
    );
  }
}

async function clearBlob(url: string, slot?: BrandingSlot) {
  if (!url || !isVercelBlobUrl(url)) {
    return NextResponse.json({ ok: true, deleted: false, reason: "not-blob" });
  }
  const settings = await getSiteSettings();
  const branding = { ...settings.branding };
  if (slot) branding[slot] = "";
  const refs = [
    branding.logoUrl,
    branding.logoMobileUrl,
    branding.faviconUrl,
    branding.ogImageUrl,
  ].filter(Boolean);
  const stillUsed = refs.includes(url);
  if (stillUsed) {
    return NextResponse.json({
      ok: true,
      deleted: false,
      reason: "still-referenced",
    });
  }
  if (!isBlobConfiguredEnv()) {
    return NextResponse.json({ ok: true, deleted: false, reason: "no-blob-env" });
  }
  try {
    await del(url);
    return NextResponse.json({ ok: true, deleted: true });
  } catch {
    return NextResponse.json({ ok: true, deleted: false, reason: "delete-failed" });
  }
}
