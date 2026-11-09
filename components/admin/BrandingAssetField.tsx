"use client";

import { useId, useRef, useState } from "react";
import { UploadCloud, ImageIcon } from "lucide-react";
import { isHttpsUrl } from "@/lib/safe-links";
import { upload } from "@vercel/blob/client";
import {
  acceptAttrForSlot,
  maxBytesForSlot,
  randomBrandingPathname,
  validateBrandingBytes,
  type BrandingSlot,
} from "@/lib/branding-upload";

const SERVER_BODY_SAFE = 4 * 1024 * 1024; // por debajo del límite ~4.5 MB de Functions

export default function BrandingAssetField({
  slot,
  label,
  value,
  blobConfigured,
  onChange,
  onBusyChange,
}: {
  slot: BrandingSlot;
  label: string;
  value: string;
  blobConfigured: boolean;
  onChange: (url: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const descriptionId = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageFailed = failedUrl === value;
  const validUrl = isHttpsUrl(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const max = maxBytesForSlot(slot);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setFeedback("");
    setProgress(null);
    if (!blobConfigured) {
      setError(
        "Subida desactivada: configura BLOB_READ_WRITE_TOKEN (o un Blob store) en el entorno.",
      );
      return;
    }
    if (file.size > max) {
      setError(`Máximo ${Math.round(max / (1024 * 1024))} MB para este campo.`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = validateBrandingBytes(slot, bytes);
    if (!checked.ok) {
      setError(checked.error);
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
    onBusyChange?.(true);
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
          onUploadProgress: ({ percentage }) =>
            setProgress(Math.round(percentage)),
        });
        url = blob.url;
      }
      setFailedUrl(null);
      onChange(url);
      setFeedback("Archivo subido. Añadido al borrador; aún no publicado.");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clearAsset() {
    setError("");
    setFeedback(
      "Recurso quitado del borrador. El archivo guardado no se elimina.",
    );
    setFailedUrl(null);
    onChange("");
  }

  return (
    <div className="media-field branding-asset">
      <div>
        <label className="field">
          {label}
          <input
            type="url"
            aria-invalid={!validUrl}
            aria-describedby={descriptionId}
            disabled={busy}
            placeholder="https://…"
            value={value}
            onChange={(e) => {
              setFailedUrl(null);
              setFeedback("");
              onChange(e.target.value);
            }}
          />
        </label>
        <div className="upload-row">
          <button
            type="button"
            className="btn secondary upload-btn"
            disabled={busy || !blobConfigured}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud size={16} aria-hidden="true" />{" "}
            {busy ? "Subiendo…" : "Elegir archivo"}
          </button>
            <input
              ref={inputRef}
              type="file"
              accept={acceptAttrForSlot(slot)}
              disabled={busy || !blobConfigured}
              hidden
            aria-label={`Subir ${label}`}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          <button
            type="button"
            className="btn secondary"
            disabled={!value || busy}
            onClick={clearAsset}
          >
            Quitar del borrador
          </button>
        </div>
        <div id={descriptionId}>
          {!validUrl ? (
            <p className="error" role="alert">
              Usa una URL https válida sin credenciales, o deja vacío para usar
              el recurso local.
            </p>
          ) : null}
          {busy ? (
            <div className="upload-progress" role="status">
              <progress
                max={100}
                value={progress ?? undefined}
                aria-label={`Subiendo ${label}`}
              />
              <span>
                {progress === null
                  ? "Enviando y validando archivo…"
                  : progress < 100
                    ? `${progress}% transferido`
                    : "Transferencia completa; finalizando…"}
              </span>
            </div>
          ) : null}
          {feedback ? (
            <p className="ok" role="status">
              {feedback}
            </p>
          ) : null}
        {!blobConfigured ? (
          <p className="muted">
            Subida desactivada hasta configurar Vercel Blob (
            <code>BLOB_READ_WRITE_TOKEN</code>). Puedes pegar una URL https.
          </p>
        ) : (
          <p className="muted">
              Máx. {Math.round(max / (1024 * 1024))} MB · sin SVG · la extensión
              se valida por contenido en el servidor. Vista previa local;
              publica con «Guardar y publicar».
          </p>
        )}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <div className="media-preview" aria-hidden={!value}>
        {value && validUrl && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={value}
            src={value}
            alt={`Vista previa ${label}`}
            onError={() => setFailedUrl(value)}
          />
        ) : (
          <span className="asset-empty">
            <ImageIcon size={24} aria-hidden="true" />
            <span>
              {imageFailed
                ? "No se pudo cargar la imagen"
                : "Recurso local por defecto"}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
