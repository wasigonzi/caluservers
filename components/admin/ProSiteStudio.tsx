"use client";

import { useEffect, useMemo, useState } from "react";
import type { Plan, PlanCategory } from "@/lib/catalog";
import type { CatalogPayload } from "@/lib/catalog-validate";
import {
  APPEARANCE_PRESETS,
  DEFAULT_SITE_SETTINGS,
  SECTION_LABELS,
  SAFE_FONTS,
  applySiteTheme,
  logoSrc,
  type AppearancePreset,
  type HomeSectionId,
  type SafeFontId,
  type SiteSettings,
} from "@/lib/site-settings";
import { INTERNAL_PATHS } from "@/lib/safe-links";
import type { BrandingSlot } from "@/lib/branding-upload";
import BrandingAssetField from "@/components/admin/BrandingAssetField";

type Tab =
  | "branding"
  | "appearance"
  | "content"
  | "sections"
  | "catalog"
  | "seo"
  | "nav"
  | "preview";

const TABS: { id: Tab; label: string; keywords: string }[] = [
  { id: "branding", label: "Branding", keywords: "logo marca nombre favicon og" },
  { id: "appearance", label: "Apariencia", keywords: "color tipografia radio sombra preset" },
  { id: "content", label: "Contenido", keywords: "hero cta textos contacto redes whmcs" },
  { id: "sections", label: "Secciones", keywords: "orden home visibilidad" },
  { id: "catalog", label: "Catálogo", keywords: "planes precio productos" },
  { id: "seo", label: "SEO", keywords: "titulo description open graph" },
  { id: "nav", label: "Navegación", keywords: "mobile bottom header footer" },
  { id: "preview", label: "Vista previa", keywords: "desktop movil" },
];

function deepEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function ProSiteStudio({
  initialSettings,
  initialCatalog,
  blobConfigured = false,
}: {
  initialSettings: SiteSettings;
  initialCatalog: CatalogPayload;
  blobConfigured?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("branding");
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState(initialSettings);
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [savedCatalog, setSavedCatalog] = useState(initialCatalog);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanCategory | "all">("all");

  const dirty =
    !deepEqual(settings, savedSettings) || !deepEqual(catalog, savedCatalog);

  useEffect(() => {
    applySiteTheme(settings);
  }, [settings]);

  const visibleTabs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TABS;
    return TABS.filter(
      (t) =>
        t.label.toLowerCase().includes(q) || t.keywords.includes(q),
    );
  }, [query]);

  function patchSettings<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setStatus("idle");
  }

  async function publish() {
    setStatus("saving");
    setMessage("");
    try {
      const r1 = await fetch("/api/admin/site-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1.error || "Error al guardar ajustes");
      const r2 = await fetch("/api/admin/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog }),
      });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error || "Error al guardar catálogo");
      setSettings(d1.settings);
      setSavedSettings(d1.settings);
      setCatalog(d2.catalog);
      setSavedCatalog(d2.catalog);
      applySiteTheme(d1.settings);
      setStatus("saved");
      setMessage("Publicado: ajustes del sitio y catálogo guardados.");
    } catch (e) {
      setStatus("error");
      setMessage(String(e instanceof Error ? e.message : e));
    }
  }

  async function restoreAll() {
    if (
      !window.confirm(
        "¿Restaurar ajustes y catálogo a los valores por defecto del código? Se sobrescribirán los datos guardados.",
      )
    ) {
      return;
    }
    setStatus("saving");
    try {
      const r1 = await fetch("/api/admin/site-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1.error || "No se pudo restaurar ajustes");
      const r2 = await fetch("/api/admin/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error || "No se pudo restaurar catálogo");
      setSettings(d1.settings);
      setSavedSettings(d1.settings);
      setCatalog(d2.catalog);
      setSavedCatalog(d2.catalog);
      applySiteTheme(d1.settings);
      setStatus("saved");
      setMessage("Valores por defecto restaurados y guardados.");
    } catch (e) {
      setStatus("error");
      setMessage(String(e instanceof Error ? e.message : e));
    }
  }

  function moveSection(index: number, dir: -1 | 1) {
    const next = [...settings.sections];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    patchSettings("sections", next);
  }

  function updatePlan(category: PlanCategory, id: string, patch: Partial<Plan>) {
    setCatalog((c) => {
      const key =
        category === "web"
          ? "webHosting"
          : category === "vps"
            ? "vps"
            : "dedicated";
      return {
        ...c,
        [key]: c[key].map((p) => (p.id === id ? { ...p, ...patch } : p)),
      };
    });
    setStatus("idle");
  }

  const plans: Plan[] = [
    ...catalog.webHosting,
    ...catalog.vps,
    ...catalog.dedicated,
  ].filter((p) => planFilter === "all" || p.category === planFilter);

  const hrefOptions = [
    ...INTERNAL_PATHS.map((p) => ({ value: p, label: p })),
    { value: "whmcs", label: "Portal WHMCS" },
  ];

  return (
    <div className="pro-studio">
      <div className="pro-toolbar">
        <label className="pro-search">
          <span className="sr-only">Buscar ajustes</span>
          <input
            type="search"
            placeholder="Buscar ajustes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="pro-actions">
          {dirty ? (
            <span className="pill warn" role="status">
              Cambios sin guardar
            </span>
          ) : (
            <span className="pill ok" role="status">
              Sincronizado
            </span>
          )}
          <button type="button" className="btn secondary" onClick={restoreAll}>
            Restaurar defaults
          </button>
          <button
            type="button"
            className="btn"
            disabled={status === "saving" || !dirty}
            onClick={publish}
          >
            {status === "saving" ? "Publicando…" : "Guardar y publicar"}
          </button>
        </div>
      </div>
      <p
        role="status"
        className={
          status === "error" ? "error" : status === "saved" ? "ok" : "muted"
        }
      >
        {message}
      </p>

      <div className="tabs" role="tablist" aria-label="Ajustes PRO">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "branding" ? (
        <section className="panel-block" aria-label="Branding">
          <h2>Branding personalizado</h2>
          <p className="muted">
            Texto plano sin HTML/scripts. Imágenes por subida a Vercel Blob o URL
            https. Vacío = recurso local por defecto. Los cambios de imagen no se
            publican hasta «Guardar y publicar».
          </p>
          <label className="field">
            Nombre de marca
            <input
              value={settings.branding.siteName}
              onChange={(e) =>
                patchSettings("branding", {
                  ...settings.branding,
                  siteName: e.target.value,
                })
              }
            />
          </label>
          <label className="field">
            Tagline
            <input
              value={settings.branding.tagline}
              onChange={(e) =>
                patchSettings("branding", {
                  ...settings.branding,
                  tagline: e.target.value,
                })
              }
            />
          </label>
          <p className="muted">
            Sube PNG/JPEG/WebP/GIF (favicon: PNG/ICO). SVG rechazado. Límite 2&nbsp;MB
            favicon / 5&nbsp;MB imágenes. La URL https sigue disponible como alternativa.
          </p>
          {(
            [
              ["logoUrl", "Logo principal"],
              ["logoMobileUrl", "Logo móvil"],
              ["faviconUrl", "Favicon"],
              ["ogImageUrl", "Imagen social / OG"],
            ] as const
          ).map(([key, label]) => (
            <BrandingAssetField
              key={key}
              slot={key as BrandingSlot}
              label={label}
              value={settings.branding[key]}
              blobConfigured={blobConfigured}
              onChange={(url) =>
                patchSettings("branding", {
                  ...settings.branding,
                  [key]: url,
                })
              }
            />
          ))}
          <div className="media-preview logo-fallback">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc(settings.branding)} alt="Logo efectivo desktop" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc(settings.branding, true)}
              alt="Logo efectivo móvil"
            />
          </div>
        </section>
      ) : null}

      {tab === "appearance" ? (
        <section className="panel-block">
          <h2>Apariencia</h2>
          <div className="preset-grid">
            {(Object.keys(APPEARANCE_PRESETS) as AppearancePreset[]).map(
              (key) => (
                <button
                  type="button"
                  key={key}
                  className={`preset${settings.appearance.preset === key ? " active" : ""}`}
                  onClick={() => {
                    const theme = APPEARANCE_PRESETS[key].theme;
                    patchSettings("appearance", {
                      ...settings.appearance,
                      preset: key,
                    });
                    patchSettings("theme", { ...theme });
                  }}
                >
                  {APPEARANCE_PRESETS[key].label}
                </button>
              ),
            )}
          </div>
          <div className="color-grid">
            {(
              [
                ["primary", "Primario"],
                ["secondary", "Acento"],
                ["background", "Fondo"],
                ["panel", "Panel"],
                ["text", "Texto"],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type="text"
                  value={settings.theme[key]}
                  onChange={(e) =>
                    patchSettings("theme", {
                      ...settings.theme,
                      [key]: e.target.value,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label className="field">
            Tipografía (conjunto seguro)
            <select
              value={settings.appearance.font}
              onChange={(e) =>
                patchSettings("appearance", {
                  ...settings.appearance,
                  font: e.target.value as SafeFontId,
                })
              }
            >
              {(Object.keys(SAFE_FONTS) as SafeFontId[]).map((id) => (
                <option key={id} value={id}>
                  {SAFE_FONTS[id].label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Radio
            <select
              value={settings.appearance.radius}
              onChange={(e) =>
                patchSettings("appearance", {
                  ...settings.appearance,
                  radius: e.target.value as SiteSettings["appearance"]["radius"],
                })
              }
            >
              <option value="sm">Suave</option>
              <option value="md">Medio</option>
              <option value="lg">Amplio</option>
            </select>
          </label>
          <label className="field">
            Sombra
            <select
              value={settings.appearance.shadow}
              onChange={(e) =>
                patchSettings("appearance", {
                  ...settings.appearance,
                  shadow: e.target.value as SiteSettings["appearance"]["shadow"],
                })
              }
            >
              <option value="soft">Suave</option>
              <option value="medium">Media</option>
              <option value="strong">Fuerte</option>
            </select>
          </label>
        </section>
      ) : null}

      {tab === "content" ? (
        <section className="panel-block">
          <h2>Contenido, contacto y CTAs</h2>
          <label className="field">
            URL portal WHMCS (https)
            <input
              type="url"
              value={settings.whmcs}
              onChange={(e) => patchSettings("whmcs", e.target.value)}
            />
          </label>
          <label className="field">
            Estado de la red
            <input
              value={settings.networkStatus}
              onChange={(e) => patchSettings("networkStatus", e.target.value)}
            />
          </label>
          <label className="field">
            Email
            <input
              type="email"
              value={settings.contact.email}
              onChange={(e) =>
                patchSettings("contact", {
                  ...settings.contact,
                  email: e.target.value,
                })
              }
            />
          </label>
          <label className="field">
            Teléfono
            <input
              value={settings.contact.phone}
              onChange={(e) =>
                patchSettings("contact", {
                  ...settings.contact,
                  phone: e.target.value,
                })
              }
            />
          </label>
          <label className="field">
            Horario / legal corto
            <input
              value={settings.contact.hours}
              onChange={(e) =>
                patchSettings("contact", {
                  ...settings.contact,
                  hours: e.target.value,
                })
              }
            />
          </label>
          {(["x", "facebook", "linkedin", "discord"] as const).map((k) => (
            <label className="field" key={k}>
              {k} (https)
              <input
                type="url"
                value={settings.social[k]}
                onChange={(e) =>
                  patchSettings("social", {
                    ...settings.social,
                    [k]: e.target.value,
                  })
                }
              />
            </label>
          ))}
          <h3>Hero</h3>
          {(
            [
              ["heroEyebrow", "Eyebrow"],
              ["heroTitle", "Título"],
              ["heroTitleAccent", "Acento"],
              ["heroCtaPrimary", "CTA primario"],
              ["heroCtaSecondary", "CTA secundario"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <input
                value={settings.content[key]}
                onChange={(e) =>
                  patchSettings("content", {
                    ...settings.content,
                    [key]: e.target.value,
                  })
                }
              />
            </label>
          ))}
          <label className="field">
            Lead hero
            <textarea
              rows={3}
              value={settings.content.heroLead}
              onChange={(e) =>
                patchSettings("content", {
                  ...settings.content,
                  heroLead: e.target.value,
                })
              }
            />
          </label>
          <label className="field">
            Destino CTA primario
            <select
              value={settings.content.heroCtaPrimaryHref}
              onChange={(e) =>
                patchSettings("content", {
                  ...settings.content,
                  heroCtaPrimaryHref: e.target.value,
                })
              }
            >
              {hrefOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Destino CTA secundario
            <select
              value={settings.content.heroCtaSecondaryHref}
              onChange={(e) =>
                patchSettings("content", {
                  ...settings.content,
                  heroCtaSecondaryHref: e.target.value,
                })
              }
            >
              {hrefOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <h3>Servicios / destacados / CTA final</h3>
          {(
            [
              ["servicesKicker", "Services kicker"],
              ["servicesTitle", "Services título"],
              ["servicesLead", "Services lead"],
              ["featuredKicker", "Featured kicker"],
              ["featuredTitle", "Featured título"],
              ["featuredLead", "Featured lead"],
              ["ctaKicker", "CTA kicker"],
              ["ctaTitle", "CTA título"],
              ["ctaLead", "CTA lead"],
              ["ctaButtonLabel", "CTA botón"],
              ["footerBlurb", "Footer"],
              ["contactLead", "Contact lead"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <input
                value={settings.content[key]}
                onChange={(e) =>
                  patchSettings("content", {
                    ...settings.content,
                    [key]: e.target.value,
                  })
                }
              />
            </label>
          ))}
          <label className="field">
            Destino CTA final
            <select
              value={settings.content.ctaButtonHref}
              onChange={(e) =>
                patchSettings("content", {
                  ...settings.content,
                  ctaButtonHref: e.target.value,
                })
              }
            >
              {hrefOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {tab === "sections" ? (
        <section className="panel-block">
          <h2>Secciones del home</h2>
          <p className="muted">
            Activa y reordena con ▲/▼. El orden se aplica realmente en la home.
          </p>
          <ul className="section-list">
            {settings.sections.map((sec, index) => (
              <li key={sec.id} className="section-row">
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={sec.enabled}
                    onChange={(e) => {
                      const next = settings.sections.map((s) =>
                        s.id === sec.id
                          ? { ...s, enabled: e.target.checked }
                          : s,
                      );
                      patchSettings("sections", next);
                    }}
                  />
                  {SECTION_LABELS[sec.id as HomeSectionId] ?? sec.id}
                </label>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    aria-label="Subir"
                    onClick={() => moveSection(index, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    aria-label="Bajar"
                    onClick={() => moveSection(index, 1)}
                  >
                    ▼
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "catalog" ? (
        <section className="panel-block">
          <h2>Catálogo de planes</h2>
          <p className="muted">
            Edita planes reales (semilla + guardado en CatalogConfig). No es CRUD
            live de WHMCS; el enlace de compra debe ser https al portal.
          </p>
          <div className="tabs compact">
            {(
              [
                ["all", "Todos"],
                ["web", "Hosting"],
                ["vps", "VPS"],
                ["dedicated", "Dedicados"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={planFilter === id ? "active" : ""}
                onClick={() => setPlanFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {plans.map((plan) => (
            <article key={plan.id} className="plan-editor glass">
              <header>
                <strong>
                  {plan.category.toUpperCase()} · {plan.id}
                </strong>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={plan.active}
                    onChange={(e) =>
                      updatePlan(plan.category, plan.id, {
                        active: e.target.checked,
                      })
                    }
                  />
                  Visible
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={!!plan.featured}
                    onChange={(e) =>
                      updatePlan(plan.category, plan.id, {
                        featured: e.target.checked,
                      })
                    }
                  />
                  Destacado
                </label>
              </header>
              <div className="plan-grid">
                <label className="field">
                  Nombre
                  <input
                    value={plan.name}
                    onChange={(e) =>
                      updatePlan(plan.category, plan.id, {
                        name: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  Precio
                  <input
                    value={plan.price}
                    onChange={(e) =>
                      updatePlan(plan.category, plan.id, {
                        price: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  Precio anterior
                  <input
                    value={plan.priceWas ?? ""}
                    onChange={(e) =>
                      updatePlan(plan.category, plan.id, {
                        priceWas: e.target.value || undefined,
                      })
                    }
                  />
                </label>
                <label className="field">
                  Etiqueta
                  <input
                    value={plan.badge ?? ""}
                    onChange={(e) =>
                      updatePlan(plan.category, plan.id, {
                        badge: e.target.value || undefined,
                      })
                    }
                  />
                </label>
                <label className="field wide">
                  Descripción
                  <input
                    value={plan.description}
                    onChange={(e) =>
                      updatePlan(plan.category, plan.id, {
                        description: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="field wide">
                  Características (una por línea)
                  <textarea
                    rows={4}
                    value={plan.features.join("\n")}
                    onChange={(e) =>
                      updatePlan(plan.category, plan.id, {
                        features: e.target.value
                          .split("\n")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="field wide">
                  URL compra WHMCS (https)
                  <input
                    type="url"
                    value={plan.purchaseUrl}
                    onChange={(e) =>
                      updatePlan(plan.category, plan.id, {
                        purchaseUrl: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "seo" ? (
        <section className="panel-block">
          <h2>SEO básico</h2>
          {(
            [
              ["title", "Título del sitio"],
              ["description", "Description"],
              ["ogTitle", "OG title"],
              ["ogDescription", "OG description"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <input
                value={settings.seo[key]}
                onChange={(e) =>
                  patchSettings("seo", {
                    ...settings.seo,
                    [key]: e.target.value,
                  })
                }
              />
            </label>
          ))}
        </section>
      ) : null}

      {tab === "nav" ? (
        <section className="panel-block">
          <h2>Header, footer y bottom nav</h2>
          <label className="checkline">
            <input
              type="checkbox"
              checked={settings.chrome.showNetworkStatus}
              onChange={(e) =>
                patchSettings("chrome", {
                  ...settings.chrome,
                  showNetworkStatus: e.target.checked,
                })
              }
            />
            Mostrar estado de red en topbar
          </label>
          <label className="field">
            Label área cliente
            <input
              value={settings.chrome.clientAreaLabel}
              onChange={(e) =>
                patchSettings("chrome", {
                  ...settings.chrome,
                  clientAreaLabel: e.target.value,
                })
              }
            />
          </label>
          <label className="field">
            Header CTA
            <input
              value={settings.chrome.headerCtaLabel}
              onChange={(e) =>
                patchSettings("chrome", {
                  ...settings.chrome,
                  headerCtaLabel: e.target.value,
                })
              }
            />
          </label>
          <label className="field">
            Header CTA destino
            <select
              value={settings.chrome.headerCtaHref}
              onChange={(e) =>
                patchSettings("chrome", {
                  ...settings.chrome,
                  headerCtaHref: e.target.value,
                })
              }
            >
              {hrefOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <h3>Bottom nav móvil (2–6 ítems)</h3>
          {settings.mobileNav.map((item, idx) => (
            <div key={item.key} className="nav-row">
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(e) => {
                    const next = settings.mobileNav.map((n, i) =>
                      i === idx ? { ...n, enabled: e.target.checked } : n,
                    );
                    patchSettings("mobileNav", next);
                  }}
                />
              </label>
              <input
                value={item.label}
                aria-label="Etiqueta"
                onChange={(e) => {
                  const next = settings.mobileNav.map((n, i) =>
                    i === idx ? { ...n, label: e.target.value } : n,
                  );
                  patchSettings("mobileNav", next);
                }}
              />
              <select
                value={item.href}
                onChange={(e) => {
                  const next = settings.mobileNav.map((n, i) =>
                    i === idx ? { ...n, href: e.target.value } : n,
                  );
                  patchSettings("mobileNav", next);
                }}
              >
                {hrefOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "preview" ? (
        <section className="panel-block">
          <h2>Vista previa segura</h2>
          <div className="tabs compact">
            <button
              type="button"
              className={preview === "desktop" ? "active" : ""}
              onClick={() => setPreview("desktop")}
            >
              Desktop
            </button>
            <button
              type="button"
              className={preview === "mobile" ? "active" : ""}
              onClick={() => setPreview("mobile")}
            >
              Móvil 390
            </button>
          </div>
          <div
            className={`preview-frame ${preview}`}
            style={{
              background: settings.theme.background,
              color: settings.theme.text,
              fontFamily: SAFE_FONTS[settings.appearance.font].css,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc(settings.branding, preview === "mobile")} alt="" />
            <p className="kicker">{settings.content.heroEyebrow}</p>
            <h3>
              {settings.content.heroTitle}{" "}
              <span style={{ color: settings.theme.primary }}>
                {settings.content.heroTitleAccent}
              </span>
            </h3>
            <p className="muted">{settings.content.heroLead}</p>
            <span
              className="btn"
              style={{ background: settings.theme.gradient, pointerEvents: "none" }}
            >
              {settings.content.heroCtaPrimary}
            </span>
            <p className="fineprint">
              Secciones activas:{" "}
              {settings.sections
                .filter((s) => s.enabled)
                .map((s) => SECTION_LABELS[s.id])
                .join(" → ")}
            </p>
          </div>
          <p className="muted">
            La vista previa no ejecuta HTML remoto. Los cambios no publicados no
            afectan a visitantes hasta «Guardar y publicar».
          </p>
        </section>
      ) : null}

      <div className="form-actions sticky-actions">
        <button
          type="button"
          className="btn"
          disabled={status === "saving" || !dirty}
          onClick={publish}
        >
          {status === "saving" ? "Publicando…" : "Guardar y publicar"}
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            setSettings(savedSettings);
            setCatalog(savedCatalog);
            setStatus("idle");
            setMessage("Cambios locales descartados.");
          }}
          disabled={!dirty}
        >
          Descartar
        </button>
      </div>
      {/* keep defaults import referenced for restore messaging */}
      <span className="sr-only">{DEFAULT_SITE_SETTINGS.branding.siteName}</span>
    </div>
  );
}
