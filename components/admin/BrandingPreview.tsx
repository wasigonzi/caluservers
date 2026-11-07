"use client";

import { Monitor, Smartphone } from "lucide-react";
import { SAFE_FONTS, logoSrc, type SiteSettings } from "@/lib/site-settings";
import { isHttpsUrl, isHexColor } from "@/lib/safe-links";

export default function BrandingPreview({
  settings,
  device,
  onDeviceChange,
  saved = false,
}: {
  settings: SiteSettings;
  device: "desktop" | "mobile";
  onDeviceChange: (device: "desktop" | "mobile") => void;
  saved?: boolean;
}) {
  const color = (value: string) => (isHexColor(value) ? value : undefined);
  const candidate = logoSrc(settings.branding, device === "mobile");
  const logo =
    candidate === "/assets/logo-principal.svg" ||
    isHttpsUrl(candidate, { allowEmpty: false })
      ? candidate
      : "/assets/logo-principal.svg";
  return (
    <div className="brand-preview-workspace">
      <div className="brand-preview-tools">
        <span>{saved ? "Último estado guardado" : "Borrador en vivo"}</span>
        <div
          className="device-switch"
          role="group"
          aria-label="Tamaño de vista previa"
        >
          <button
            type="button"
            aria-label="Vista desktop"
            aria-pressed={device === "desktop"}
            onClick={() => onDeviceChange("desktop")}
          >
            <Monitor size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Vista móvil"
            aria-pressed={device === "mobile"}
            onClick={() => onDeviceChange("mobile")}
          >
            <Smartphone size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        className={`brand-site-preview ${device}`}
        style={{
          background: color(settings.theme.background),
          color: color(settings.theme.text),
          fontFamily: SAFE_FONTS[settings.appearance.font]?.css,
        }}
      >
        <div className="brand-preview-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={settings.branding.siteName} />
          <span>{settings.branding.siteName}</span>
        </div>
        <div className="brand-preview-hero">
          <small style={{ color: color(settings.theme.primary) }}>
            {settings.content.heroEyebrow}
          </small>
          <h3>
            {settings.content.heroTitle}{" "}
            <span style={{ color: color(settings.theme.primary) }}>
              {settings.content.heroTitleAccent}
            </span>
          </h3>
          <p>{settings.content.heroLead}</p>
          <span
            className="brand-preview-cta"
            style={{
              borderColor: color(settings.theme.primary),
              color: color(settings.theme.primary),
            }}
          >
            {settings.content.heroCtaPrimary}
          </span>
        </div>
        <div
          className="brand-preview-sample"
          style={{ background: color(settings.theme.panel) }}
        >
          <span
            style={{ background: color(settings.theme.secondary) }}
            aria-hidden="true"
          />
          <div>
            <strong>{settings.branding.siteName}</strong>
            <p>{settings.branding.tagline}</p>
          </div>
        </div>
      </div>
      <p className="preview-disclaimer">
        Representación visual · sin navegación ni publicación automática.
      </p>
    </div>
  );
}
