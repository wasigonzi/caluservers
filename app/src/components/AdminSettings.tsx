import type { FormEvent } from "react";
import type { SiteSettings } from "../lib/catalog";
import {
  APPEARANCE_PRESETS,
  DEFAULT_SITE_SETTINGS,
  type AppearancePreset,
  validateSiteSettings,
} from "../lib/siteSettings";

export type SettingsSection = "general" | "contenido" | "apariencia";

export function AdminSettingsForm({
  settings,
  setSettings,
  section,
  onSave,
  onRestoreDefaults,
  disabled,
  status,
}: {
  settings: SiteSettings;
  setSettings: (s: SiteSettings | null) => void;
  section: SettingsSection;
  onSave: (e: FormEvent) => void;
  onRestoreDefaults: () => void;
  disabled?: boolean;
  status?: string;
}) {
  function applyPreset(preset: AppearancePreset) {
    const theme = APPEARANCE_PRESETS[preset].theme;
    setSettings({
      ...settings,
      appearance: { preset },
      theme: { ...theme },
    });
  }

  return (
    <form className="admin-form admin-settings" onSubmit={onSave}>
      {disabled ? (
        <p className="notice glass" role="status">
          Vista previa: el guardado está desactivado hasta configurar Supabase
          e iniciar sesión como administrador.
        </p>
      ) : null}
      {status ? (
        <p className="notice glass" role="status">
          {status}
        </p>
      ) : null}

      {section === "general" ? (
        <fieldset className="admin-fieldset" disabled={disabled}>
          <legend>General</legend>
          <p className="muted">
            Portal de cliente, estado de red y datos de contacto públicos.
          </p>
          <div className="field">
            <label htmlFor="s-whmcs">URL del portal WHMCS</label>
            <input
              id="s-whmcs"
              type="url"
              required
              value={settings.whmcs}
              onChange={(e) =>
                setSettings({ ...settings, whmcs: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="s-status">Estado de la red (topbar)</label>
            <input
              id="s-status"
              required
              value={settings.networkStatus}
              onChange={(e) =>
                setSettings({ ...settings, networkStatus: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="s-email">Email de contacto público</label>
            <input
              id="s-email"
              type="email"
              value={settings.contact.email}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  contact: { ...settings.contact, email: e.target.value },
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="s-phone">Teléfono (opcional)</label>
            <input
              id="s-phone"
              value={settings.contact.phone}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  contact: { ...settings.contact, phone: e.target.value },
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="s-hours">Horario / nota de soporte</label>
            <input
              id="s-hours"
              value={settings.contact.hours}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  contact: { ...settings.contact, hours: e.target.value },
                })
              }
            />
          </div>
          <h4 className="admin-subhead">Redes sociales (solo si hay URL)</h4>
          {(
            [
              ["x", "X / Twitter"],
              ["facebook", "Facebook"],
              ["linkedin", "LinkedIn"],
              ["discord", "Discord"],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={`s-social-${key}`}>{label}</label>
              <input
                id={`s-social-${key}`}
                type="url"
                placeholder="https://"
                value={settings.social[key]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    social: { ...settings.social, [key]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </fieldset>
      ) : null}

      {section === "contenido" ? (
        <fieldset className="admin-fieldset" disabled={disabled}>
          <legend>Contenido</legend>
          <p className="muted">
            Textos del hero, CTA, contacto y visibilidad de secciones en la
            homepage.
          </p>
          <div className="admin-preview glass">
            <span className="kicker">{settings.content.heroEyebrow || "…"}</span>
            <h3>
              {settings.content.heroTitle}{" "}
              <span className="neon-text">
                {settings.content.heroTitleAccent}
              </span>
            </h3>
            <p className="muted">{settings.content.heroLead}</p>
            <div className="hero-ctas" style={{ margin: 0 }}>
              <span className="btn primary">{settings.content.heroCtaPrimary}</span>
              <span className="btn secondary">
                {settings.content.heroCtaSecondary}
              </span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-eyebrow">Hero · eyebrow</label>
            <input
              id="c-eyebrow"
              value={settings.content.heroEyebrow}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  content: { ...settings.content, heroEyebrow: e.target.value },
                })
              }
            />
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="c-title">Hero · título</label>
              <input
                id="c-title"
                required
                value={settings.content.heroTitle}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, heroTitle: e.target.value },
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="c-accent">Hero · acento</label>
              <input
                id="c-accent"
                value={settings.content.heroTitleAccent}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: {
                      ...settings.content,
                      heroTitleAccent: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-lead">Hero · lead</label>
            <textarea
              id="c-lead"
              rows={4}
              required
              value={settings.content.heroLead}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  content: { ...settings.content, heroLead: e.target.value },
                })
              }
            />
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="c-cta1">CTA primario</label>
              <input
                id="c-cta1"
                required
                value={settings.content.heroCtaPrimary}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: {
                      ...settings.content,
                      heroCtaPrimary: e.target.value,
                    },
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="c-cta2">CTA secundario</label>
              <input
                id="c-cta2"
                required
                value={settings.content.heroCtaSecondary}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: {
                      ...settings.content,
                      heroCtaSecondary: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-contact-lead">Lead de Contacto</label>
            <textarea
              id="c-contact-lead"
              rows={3}
              value={settings.content.contactLead}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  content: { ...settings.content, contactLead: e.target.value },
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="c-footer">Texto del footer</label>
            <textarea
              id="c-footer"
              rows={2}
              value={settings.content.footerBlurb}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  content: { ...settings.content, footerBlurb: e.target.value },
                })
              }
            />
          </div>
          <h4 className="admin-subhead">Visibilidad en homepage</h4>
          {(
            [
              ["trustStrip", "Tira de confianza"],
              ["steps", "Cómo funciona"],
              ["compare", "Comparativa"],
              ["locations", "Ubicaciones"],
              ["whyUs", "Por qué CaluServers"],
              ["faq", "FAQ"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="checkline">
              <input
                type="checkbox"
                checked={settings.visibility[key]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    visibility: {
                      ...settings.visibility,
                      [key]: e.target.checked,
                    },
                  })
                }
              />
              Mostrar «{label}»
            </label>
          ))}
        </fieldset>
      ) : null}

      {section === "apariencia" ? (
        <fieldset className="admin-fieldset" disabled={disabled}>
          <legend>Apariencia</legend>
          <p className="muted">
            Presets alineados al estilo glass existente. Los colores se aplican
            a las variables CSS del sitio (--calu-cyan, --bg, etc.).
          </p>
          <div className="admin-preset-grid">
            {(Object.keys(APPEARANCE_PRESETS) as AppearancePreset[]).map(
              (key) => (
                <button
                  key={key}
                  type="button"
                  className={`admin-preset glass${
                    settings.appearance.preset === key ? " active" : ""
                  }`}
                  onClick={() => applyPreset(key)}
                >
                  <span
                    className="admin-preset-swatch"
                    style={{
                      background: APPEARANCE_PRESETS[key].theme.gradient,
                    }}
                  />
                  {APPEARANCE_PRESETS[key].label}
                </button>
              ),
            )}
          </div>
          <div className="admin-preview glass">
            <p className="muted">Previsualización de acento</p>
            <strong style={{ color: settings.theme.primary }}>
              {settings.theme.primary}
            </strong>
            <div
              style={{
                marginTop: 10,
                height: 12,
                borderRadius: 999,
                background: settings.theme.gradient,
              }}
            />
          </div>
          {(
            [
              ["primary", "Acento primario"],
              ["secondary", "Acento secundario"],
              ["background", "Fondo"],
              ["text", "Texto"],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={`t-${key}`}>{label}</label>
              <div className="admin-color-row">
                <input
                  id={`t-${key}`}
                  value={settings.theme[key]}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      theme: { ...settings.theme, [key]: e.target.value },
                    })
                  }
                />
                <input
                  type="color"
                  aria-label={`${label} color`}
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(settings.theme[key])
                      ? settings.theme[key]
                      : "#00E5FF"
                  }
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      theme: { ...settings.theme, [key]: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          ))}
          <div className="field">
            <label htmlFor="t-gradient">Gradiente de botones</label>
            <input
              id="t-gradient"
              value={settings.theme.gradient}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  theme: { ...settings.theme, gradient: e.target.value },
                })
              }
            />
          </div>
        </fieldset>
      ) : null}

      <div className="admin-actions">
        <button className="btn primary" type="submit" disabled={disabled}>
          Guardar {section}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={disabled}
          onClick={onRestoreDefaults}
        >
          Restaurar valores por defecto
        </button>
      </div>
      <p className="fineprint">
        Validación: {validateSiteSettings(settings) ?? "listo para guardar."}
      </p>
    </form>
  );
}

export { DEFAULT_SITE_SETTINGS };
