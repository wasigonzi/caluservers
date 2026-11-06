import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Plan, SiteSettings, VpsLocation } from "../lib/catalog";
import { useCatalog } from "../lib/useCatalog";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  deletePlanAdmin,
  ensureFirstAdmin,
  fetchLocationsAdmin,
  fetchPlansAdmin,
  fetchSettingsAdmin,
  getSessionUser,
  saveLocationAdmin,
  savePlanAdmin,
  saveSettingsAdmin,
  signIn,
  signOut,
} from "../lib/admin";
import { PageHero, useDocumentTitle } from "../components/Layout";

type Tab = "planes" | "ubicaciones" | "ajustes";

const CATEGORY_LABELS: Record<Plan["category"], string> = {
  web: "Web Hosting",
  vps: "VPS",
  dedicated: "Dedicados",
};

function emptyPlan(category: Plan["category"]): Plan {
  return {
    id: "",
    category,
    name: "",
    price: "",
    description: "",
    features: [],
    locationId: "",
    purchaseUrl: "",
    sortOrder: 0,
    active: true,
  };
}

export default function Admin() {
  useDocumentTitle("Admin");
  const { catalog } = useCatalog();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(
    null,
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>("planes");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [locations, setLocations] = useState<VpsLocation[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [featuresText, setFeaturesText] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    void (async () => {
      const sessionUser = await getSessionUser();
      setUser(sessionUser);
      if (sessionUser) {
        const res = await ensureFirstAdmin(sessionUser.id);
        setIsAdmin(Boolean(res.ok && res.data));
        if (!res.ok) setAuthError(res.error ?? "");
      }
      setChecking(false);
    })();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const [p, l, s] = await Promise.all([
        fetchPlansAdmin(),
        fetchLocationsAdmin(),
        fetchSettingsAdmin(),
      ]);
      if (p.ok && p.data) setPlans(p.data);
      if (l.ok && l.data) setLocations(l.data);
      if (s.ok && s.data) setSettings(s.data);
      const errs = [p, l, s].filter((r) => !r.ok).map((r) => r.error);
      if (errs.length > 0) setStatus(errs.join(" "));
    })();
  }, [isAdmin]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setAuthError("");
    const res = await signIn(email, password);
    if (!res.ok || !res.data) {
      setAuthError(res.error ?? "No se pudo iniciar sesión.");
      return;
    }
    setUser(res.data);
    const admin = await ensureFirstAdmin(res.data.id);
    if (!admin.ok) {
      setAuthError(admin.error ?? "");
      return;
    }
    if (!admin.data) {
      setAuthError(
        "Tu cuenta no tiene permisos de administrador. Pide a un administrador existente que te añada.",
      );
      return;
    }
    setIsAdmin(true);
  }

  async function onLogout() {
    await signOut();
    setUser(null);
    setIsAdmin(false);
    setPlans([]);
    setLocations([]);
    setSettings(null);
  }

  function startEdit(plan: Plan) {
    setEditing({ ...plan, features: [...plan.features] });
    setFeaturesText(plan.features.join("\n"));
    setStatus("");
  }

  function startNew(category: Plan["category"]) {
    const p = emptyPlan(category);
    p.sortOrder =
      Math.max(0, ...plans.filter((x) => x.category === category).map((x) => x.sortOrder)) + 1;
    setEditing(p);
    setFeaturesText("");
    setStatus("");
  }

  async function onSavePlan(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const plan: Plan = {
      ...editing,
      name: editing.name.trim(),
      price: editing.price.trim(),
      features: featuresText
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean),
      id:
        editing.id ||
        `${editing.category}-${editing.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")}`,
    };
    const res = await savePlanAdmin(plan);
    if (!res.ok || !res.data) {
      setStatus(res.error ?? "No se pudo guardar el plan.");
      return;
    }
    setPlans((prev) => {
      const exists = prev.some((p) => p.id === res.data!.id);
      return exists
        ? prev.map((p) => (p.id === res.data!.id ? res.data! : p))
        : [...prev, res.data!];
    });
    setEditing(null);
    setStatus("Plan guardado.");
  }

  async function onDeletePlan(id: string) {
    if (!window.confirm("¿Eliminar este plan?")) return;
    const res = await deletePlanAdmin(id);
    if (!res.ok) {
      setStatus(res.error ?? "No se pudo eliminar el plan.");
      return;
    }
    setPlans((prev) => prev.filter((p) => p.id !== id));
    setStatus("Plan eliminado.");
  }

  async function onSaveLocation(loc: VpsLocation) {
    const res = await saveLocationAdmin(loc);
    if (!res.ok || !res.data) {
      setStatus(res.error ?? "No se pudo guardar la ubicación.");
      return;
    }
    setLocations((prev) =>
      prev.map((l) => (l.id === res.data!.id ? res.data! : l)),
    );
    setStatus("Ubicación guardada.");
  }

  async function onSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const res = await saveSettingsAdmin(settings);
    setStatus(
      res.ok ? "Ajustes guardados." : (res.error ?? "No se pudieron guardar."),
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <>
        <PageHero
          kicker="Admin"
          title="Panel de administración"
          lead="Gestiona planes, ubicaciones y ajustes del sitio."
        />
        <section className="wrap">
          <div className="glass notice" role="alert">
            <strong>Supabase no está configurado.</strong>
            <p>
              El panel de administración necesita las variables de entorno{" "}
              <code>VITE_SUPABASE_URL</code> y{" "}
              <code>VITE_SUPABASE_ANON_KEY</code> en Vercel, y aplicar{" "}
              <code>supabase/schema.sql</code> en el proyecto de Supabase.
              Mientras tanto, la edición está desactivada — el sitio público
              sigue mostrando el catálogo de referencia.
            </p>
          </div>
          <form className="formbox glass" aria-disabled="true">
            <div className="field">
              <label htmlFor="a-email">Email</label>
              <input id="a-email" type="email" disabled />
            </div>
            <div className="field">
              <label htmlFor="a-pass">Contraseña</label>
              <input id="a-pass" type="password" disabled />
            </div>
            <button className="btn primary" type="button" disabled>
              Iniciar sesión
            </button>
          </form>
        </section>
      </>
    );
  }

  if (checking) {
    return (
      <>
        <PageHero kicker="Admin" title="Panel de administración" lead="" />
        <section className="wrap">
          <p className="notice glass">Comprobando sesión…</p>
        </section>
      </>
    );
  }

  if (!user || !isAdmin) {
    return (
      <>
        <PageHero
          kicker="Admin"
          title="Panel de administración"
          lead="Inicia sesión con tu cuenta de administrador."
        />
        <section className="wrap">
          <form className="formbox glass" onSubmit={onLogin}>
            <div className="field">
              <label htmlFor="l-email">Email</label>
              <input
                id="l-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="l-pass">Contraseña</label>
              <input
                id="l-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {authError ? (
              <p className="notice glass" role="alert">
                {authError}
              </p>
            ) : null}
            <button className="btn primary" type="submit">
              Iniciar sesión
            </button>
            <p className="muted">
              El primer usuario que entra al admin se convierte en
              administrador. Los siguientes necesitan que un administrador los
              añada.
            </p>
          </form>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHero
        kicker="Admin"
        title="Panel de administración"
        lead={`Sesión iniciada como ${user.email ?? user.id}.`}
      />
      <section className="wrap">
        <div className="admin-tabs" role="tablist">
          {(["planes", "ubicaciones", "ajustes"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`admin-tab glass${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "planes"
                ? "Planes"
                : t === "ubicaciones"
                  ? "Ubicaciones"
                  : "Ajustes"}
            </button>
          ))}
          <button
            type="button"
            className="btn ghost"
            style={{ marginLeft: "auto" }}
            onClick={onLogout}
          >
            Cerrar sesión
          </button>
        </div>
        {status ? <p className="notice glass">{status}</p> : null}

        {tab === "planes" && (
          <div className="admin-card glass">
            {(["web", "vps", "dedicated"] as Plan["category"][]).map(
              (cat) => (
                <div key={cat}>
                  <div className="admin-row">
                    <h3>{CATEGORY_LABELS[cat]}</h3>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => startNew(cat)}
                    >
                      + Nuevo plan
                    </button>
                  </div>
                  <ul className="admin-list">
                    {plans
                      .filter((p) => p.category === cat)
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((p) => (
                        <li key={p.id} className="admin-row">
                          <span>
                            <strong>{p.name}</strong> · {p.price}
                            {p.locationId ? ` · ${p.locationId}` : ""}
                            {!p.active ? " · inactivo" : ""}
                          </span>
                          <span>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => startEdit(p)}
                            >
                              Editar
                            </button>{" "}
                            <button
                              type="button"
                              className="btn danger"
                              onClick={() => onDeletePlan(p.id)}
                            >
                              Eliminar
                            </button>
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ),
            )}
            {editing && (
              <form className="admin-form" onSubmit={onSavePlan}>
                <h3>
                  {editing.id ? `Editar: ${editing.name}` : "Nuevo plan"}
                </h3>
                <div className="field">
                  <label htmlFor="p-name">Nombre</label>
                  <input
                    id="p-name"
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="p-price">Precio (ej. $6.99)</label>
                  <input
                    id="p-price"
                    value={editing.price}
                    onChange={(e) =>
                      setEditing({ ...editing, price: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="p-desc">Descripción</label>
                  <textarea
                    id="p-desc"
                    value={editing.description}
                    onChange={(e) =>
                      setEditing({ ...editing, description: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="p-features">
                    Características (una por línea)
                  </label>
                  <textarea
                    id="p-features"
                    rows={6}
                    value={featuresText}
                    onChange={(e) => setFeaturesText(e.target.value)}
                  />
                </div>
                {editing.category === "vps" && (
                  <div className="field">
                    <label htmlFor="p-loc">Ubicación</label>
                    <select
                      id="p-loc"
                      value={editing.locationId}
                      onChange={(e) =>
                        setEditing({ ...editing, locationId: e.target.value })
                      }
                    >
                      <option value="">Sin ubicación</option>
                      {catalog.locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} — {l.city}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="p-url">URL de compra</label>
                  <input
                    id="p-url"
                    type="url"
                    value={editing.purchaseUrl}
                    onChange={(e) =>
                      setEditing({ ...editing, purchaseUrl: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label>
                    <input
                      type="checkbox"
                      checked={editing.active}
                      onChange={(e) =>
                        setEditing({ ...editing, active: e.target.checked })
                      }
                    />{" "}
                    Activo
                  </label>
                </div>
                <button className="btn primary" type="submit">
                  Guardar plan
                </button>{" "}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </button>
              </form>
            )}
          </div>
        )}

        {tab === "ubicaciones" && (
          <div className="admin-card glass">
            <ul className="admin-list">
              {locations.map((loc) => (
                <li key={loc.id} className="admin-row">
                  <span>
                    {loc.flag} <strong>{loc.name}</strong> — {loc.city}
                    {loc.badge ? ` (${loc.badge})` : ""}
                  </span>
                  <span>
                    <input
                      type="text"
                      value={loc.badge}
                      aria-label="Insignia"
                      placeholder="Insignia"
                      onChange={(e) =>
                        setLocations((prev) =>
                          prev.map((l) =>
                            l.id === loc.id
                              ? { ...l, badge: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />{" "}
                    <input
                      type="text"
                      value={loc.city}
                      aria-label="Ciudad"
                      onChange={(e) =>
                        setLocations((prev) =>
                          prev.map((l) =>
                            l.id === loc.id
                              ? { ...l, city: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />{" "}
                    <label>
                      <input
                        type="checkbox"
                        checked={loc.enabled}
                        onChange={(e) =>
                          setLocations((prev) =>
                            prev.map((l) =>
                              l.id === loc.id
                                ? { ...l, enabled: e.target.checked }
                                : l,
                            ),
                          )
                        }
                      />{" "}
                      Habilitada
                    </label>{" "}
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => onSaveLocation(loc)}
                    >
                      Guardar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "ajustes" && settings && (
          <div className="admin-card glass">
            <form className="admin-form" onSubmit={onSaveSettings}>
              <div className="field">
                <label htmlFor="s-whmcs">URL del portal WHMCS</label>
                <input
                  id="s-whmcs"
                  type="url"
                  value={settings.whmcs}
                  onChange={(e) =>
                    setSettings({ ...settings, whmcs: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="s-status">Estado de la red</label>
                <input
                  id="s-status"
                  value={settings.networkStatus}
                  onChange={(e) =>
                    setSettings({ ...settings, networkStatus: e.target.value })
                  }
                />
              </div>
              {(
                [
                  ["primary", "Color primario"],
                  ["secondary", "Color secundario"],
                  ["background", "Fondo"],
                  ["panel", "Panel"],
                  ["text", "Texto"],
                ] as const
              ).map(([key, label]) => (
                <div className="field" key={key}>
                  <label htmlFor={`s-${key}`}>{label}</label>
                  <input
                    id={`s-${key}`}
                    value={settings.theme[key]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        theme: { ...settings.theme, [key]: e.target.value },
                      })
                    }
                  />
                </div>
              ))}
              <div className="field">
                <label htmlFor="s-gradient">Gradiente</label>
                <input
                  id="s-gradient"
                  value={settings.theme.gradient}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      theme: { ...settings.theme, gradient: e.target.value },
                    })
                  }
                />
              </div>
              <button className="btn primary" type="submit">
                Guardar ajustes
              </button>
            </form>
          </div>
        )}
      </section>
    </>
  );
}
