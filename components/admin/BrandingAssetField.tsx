"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  acceptAttrForSlot,
  maxBytesForSlot,
  randomBrandingPathname,
  type BrandingSlot,
} from "@/lib/branding-upload";

const SERVER_BODY_SAFE = 4 * 1024 * 1024; // por debajo del límite ~4.5 MB de Functions

export default function BrandingAssetField({
  slot,
  label,
  value,
  blobConfigured,
  onChange,
}: {
  slot: BrandingSlot;
  label: string;
  value: string;
  blobConfigured: boolean;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const max = maxBytesForSlot(slot);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!blobConfigured) {
      setError(
        "Subida desactivada: configura BLOB_READ_WRITE_TOKEN (o un Blob store) en el entorno.",
      );
      return;
    }
    if (file.size > max) {
      setError(
        `Máximo ${Math.round(max / (1024 * 1024))} MB para este campo.`,
      );
      return;
    }
    // Rechazo SVG por extensión/tipo declarado (el servidor valida magic bytes)
    const name = file.name.toLowerCase();
    if (
      name.endsWith(".svg") ||
      file.type === "image/svg+xml" ||
      file.type === "text/html"
    ) {
      setError(
        "SVG y HTML no están permitidos (riesgo XSS). Usa PNG, JPEG, WebP o GIF; favicon PNG/ICO.",
      );
      return;
    }
    setBusy(true);
    try {
      let url = "";
      if (file.size <= SERVER_BODY_SAFE) {
        const form = new FormData();
        form.set("slot", slot);
        form.set("file", file);
        const r = await fetch("/api/admin/branding-upload", {
          method: "POST",
          body: form,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error al subir");
        url = data.url as string;
      } else {
        // Client upload directo a Blob (hasta 5 MB) con token autenticado
        const extGuess = name.split(".").pop() || "bin";
        const pathname = randomBrandingPathname(slot, extGuess, "pending");
        const blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/admin/branding-upload",
          clientPayload: JSON.stringify({ slot }),
        });
        url = blob.url;
      }
      onChange(url);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function clearAsset() {
    setError("");
    const prev = value;
    onChange("");
    if (!prev || !blobConfigured) return;
    try {
      await fetch("/api/admin/branding-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-blob", url: prev, slot }),
      });
    } catch {
      // La URL ya se limpió en memoria; el borrado de blob es best-effort.
    }
  }

  return (
    <div className="media-field branding-asset">
      <div>
        <label className="field">
          {label} — URL https (alternativa)
          <input
            type="url"
            placeholder="https://…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        <div className="upload-row">
          <label className={`btn secondary upload-btn${blobConfigured ? "" : " disabled"}`}>
            {busy ? "Subiendo…" : "Subir archivo"}
            <input
              ref={inputRef}
              type="file"
              accept={acceptAttrForSlot(slot)}
              disabled={busy || !blobConfigured}
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            className="btn secondary"
            disabled={!value || busy}
            onClick={clearAsset}
          >
            Quitar / default
          </button>
        </div>
        {!blobConfigured ? (
          <p className="muted">
            Subida desactivada hasta configurar Vercel Blob (
            <code>BLOB_READ_WRITE_TOKEN</code>). Puedes pegar una URL https.
          </p>
        ) : (
          <p className="muted">
            Máx. {Math.round(max / (1024 * 1024))} MB · sin SVG · la extensión se
            valida por contenido en el servidor. Vista previa local; publica con
            «Guardar y publicar».
          </p>
        )}
        {error ? <p className="error">{error}</p> : null}
      </div>
      <div className="media-preview" aria-hidden={!value}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = "0.3";
            }}
          />
        ) : (
          <span className="muted">Fallback local</span>
        )}
      </div>
    </div>
  );
}
