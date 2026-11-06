"use client";

import { useMemo, useState } from "react";
import type { SiteSettings, AppearancePreset } from "@/lib/site-settings";
import { APPEARANCE_PRESETS, applySiteTheme } from "@/lib/site-settings";

type Tab = "general" | "content" | "appearance";

export default function SiteSettingsForm({
  initial,
}: {
  initial: SiteSettings;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<SiteSettings>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  const previewTheme = useMemo(() => {
    const preset = APPEARANCE_PRESETS[settings.appearance.preset]?.theme;
    return { ...(preset ?? settings.theme), ...settings.theme };
  }, [settings]);

  function patch<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setStatus("idle");
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      const r = await fetch("/api/admin/site-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "No se pudo guardar");
      setSettings(data.settings);
      applySiteTheme(data.settings);
      setStatus("saved");
      setMessage("Ajustes del sitio guardados.");
    } catch (err) {
      setStatus("error");
      setMessage(String(err instanceof Error ? err.message : err));
    }
  }

  return (
    <form className="site-settings-form" onSubmit={onSave}>
      <div className="tabs" role="tablist" aria-label="Secciones de configuración">
        {(
          [
            ["general", "General"],
            ["content", "Contenido"],
            ["appearance", "Apariencia"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "general" ? (
        <div className="panel-block" role="tabpanel">
          <h2>Contacto y redes</h2>
          <p className="muted">
            Estos valores se muestran en el footer, contacto y topbar. La URL WHMCS
            pública apunta al área de clientes (distinta de la API cifrada).
          </p>
          <label className="field">
            URL portal WHMCS (pública)
            <input
              type="url"
              required
              value={settings.whmcs}
              onChange={(e) => patch("whmcs", e.target.value)}
            />
          </label>
          <label className="field">
            Estado de la red
            <input
              value={settings.networkStatus}
              onChange={(e) => patch("networkStatus", e.target.value)}
            />
          </label>
          <label className="field">
            Email
            <input
              type="email"
              value={settings.contact.email}
              onChange={(e) =>
                patch("contact", { ...settings.contact, email: e.target.value })
              }
            />
          </label>
          <label className="field">
            Teléfono
            <input
              value={settings.contact.phone}
              onChange={(e) =>
                patch("contact", { ...settings.contact, phone: e.target.value })
              }
            />
          </label>
          <label className="field">
            Horario
            <input
              value={settings.contact.hours}
              onChange={(e) =>
                patch("contact", { ...settings.contact, hours: e.target.value })
              }
            />
          </label>
          {(["x", "facebook", "linkedin", "discord"] as const).map((k) => (
            <label className="field" key={k}>
              {k}
              <input
                type="url"
                placeholder="https://…"
                value={settings.social[k]}
                onChange={(e) =>
                  patch("social", { ...settings.social, [k]: e.target.value })
                }
              />
            </label>
          ))}
          <h3>Visibilidad de secciones (Home)</h3>
          {(
            [
              ["trustStrip", "Franja de confianza"],
              ["steps", "Pasos"],
              ["compare", "Comparativa"],
              ["locations", "Ubicaciones"],
              ["whyUs", "Por qué nosotros"],
              ["faq", "FAQ"],
            ] as const
          ).map(([key, label]) => (
            <label className="checkline" key={key}>
              <input
                type="checkbox"
                checked={settings.visibility[key]}
                onChange={(e) =>
                  patch("visibility", {
                    ...settings.visibility,
                    [key]: e.target.checked,
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      ) : null}

      {tab === "content" ? (
        <div className="panel-block" role="tabpanel">
          <h2>Contenido y CTAs</h2>
          <label className="field">
            Hero eyebrow
            <input
              value={settings.content.heroEyebrow}
              onChange={(e) =>
                patch("content", { ...settings.content, heroEyebrow: e.target.value })
              }
            />
          </label>
          <label className="field">
            Hero título
            <input
              required
              value={settings.content.heroTitle}
              onChange={(e) =>
                patch("content", { ...settings.content, heroTitle: e.target.value })
              }
            />
          </label>
          <label className="field">
            Hero acento
            <input
              value={settings.content.heroTitleAccent}
              onChange={(e) =>
                patch("content", {
                  ...settings.content,
                  heroTitleAccent: e.target.value,
                })
              }
            />
          </label>
          <label className="field">
            Hero lead
            <textarea
              required
              rows={3}
              value={settings.content.heroLead}
              onChange={(e) =>
                patch("content", { ...settings.content, heroLead: e.target.value })
              }
            />
          </label>
          <label className="field">
            CTA primario
            <input
              required
              value={settings.content.heroCtaPrimary}
              onChange={(e) =>
                patch("content", {
                  ...settings.content,
                  heroCtaPrimary: e.target.value,
                })
              }
            />
          </label>
          <label className="field">
            CTA secundario
            <input
              required
              value={settings.content.heroCtaSecondary}
              onChange={(e) =>
                patch("content", {
                  ...settings.content,
                  heroCtaSecondary: e.target.value,
                })
              }
            />
          </label>
          <label className="field">
            Lead de contacto
            <textarea
              rows={2}
              value={settings.content.contactLead}
              onChange={(e) =>
                patch("content", { ...settings.content, contactLead: e.target.value })
              }
            />
          </label>
          <label className="field">
            Blurb del footer
            <textarea
              rows={2}
              value={settings.content.footerBlurb}
              onChange={(e) =>
                patch("content", { ...settings.content, footerBlurb: e.target.value })
              }
            />
          </label>
        </div>
      ) : null}

      {tab === "appearance" ? (
        <div className="panel-block" role="tabpanel">
          <h2>Apariencia</h2>
          <p className="muted">
            El preset aplica colores base. La vista previa solo cambia variables CSS
            locales (sin guardar hasta pulsar Guardar).
          </p>
          <div className="preset-grid">
            {(Object.keys(APPEARANCE_PRESETS) as AppearancePreset[]).map((key) => (
              <button
                type="button"
                key={key}
                className={`preset${settings.appearance.preset === key ? " active" : ""}`}
                onClick={() => {
                  const theme = APPEARANCE_PRESETS[key].theme;
                  const next = {
                    ...settings,
                    appearance: { preset: key },
                    theme: { ...theme },
                  };
                  setSettings(next);
                  applySiteTheme(next);
                }}
              >
                {APPEARANCE_PRESETS[key].label}
              </button>
            ))}
          </div>
          <div
            className="appearance-preview glass"
            style={{
              borderColor: previewTheme.primary,
              background: `linear-gradient(135deg, ${previewTheme.panel}, ${previewTheme.background})`,
              color: previewTheme.text,
            }}
          >
            <strong style={{ color: previewTheme.primary }}>Vista previa segura</strong>
            <p className="muted">Texto de ejemplo · CTA · acento</p>
            <span
              className="btn"
              style={{ background: previewTheme.gradient, pointerEvents: "none" }}
            >
              Botón de ejemplo
            </span>
          </div>
        </div>
      ) : null}

      <div className="form-actions">
        <button className="btn" type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Guardando…" : "Guardar ajustes del sitio"}
        </button>
        <p
          role="status"
          className={status === "error" ? "error" : status === "saved" ? "ok" : "muted"}
        >
          {message}
        </p>
      </div>
    </form>
  );
}
