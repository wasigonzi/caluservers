"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { contrastRatio } from "@/lib/branding-preview";

type Palette = { background: string; text: string; primary: string; secondary: string };

/** Ratios are per foreground/background pair, not a certification of the full UI. */
export default function BrandContrast({ theme }: { theme: Palette }) {
  return (
    <div className="brand-contrast" aria-label="Contraste por combinación">
      <h4>Contraste sobre el fondo</h4>
      {([ ["text", "Texto / fondo"], ["primary", "Primario / fondo"], ["secondary", "Acento / fondo"] ] as const).map(([key, label]) => {
        const ratio = contrastRatio(theme.background, theme[key]);
        const passes = ratio !== null && ratio >= 4.5;
        const Icon = passes ? CheckCircle2 : AlertCircle;
        return (
          <p key={key} data-contrast-pair={key} className={`contrast-status ${passes ? "ok" : "warn"}`}>
            <Icon size={16} aria-hidden="true" />
            <span><strong>{label}</strong><br />{ratio === null ? "Color hex no válido; sin medición." : `${ratio.toFixed(2)}:1 · ${passes ? "AA para texto normal" : "No alcanza 4.5:1 para texto normal"}`}</span>
          </p>
        );
      })}
      <p className="muted">Cada ratio evalúa ese color como texto sobre el fondo. No certifica toda la interfaz; los acentos decorativos tienen otro uso.</p>
    </div>
  );
}
