"use client";

import { useState } from "react";
import type { Dictionary } from "@/lib/i18n";

/** Preferencias del portal en /cuenta/perfil: idioma, diseño y densidad. */
export default function PortalPreferencesForm({
  initial,
  dict,
}: {
  initial: { locale: string; portalTheme: string; portalDensity: string };
  dict: Dictionary;
}) {
  const [locale, setLocale] = useState(initial.locale);
  const [portalTheme, setPortalTheme] = useState(initial.portalTheme);
  const [portalDensity, setPortalDensity] = useState(initial.portalDensity);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/account/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, portalTheme, portalDensity }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || dict.portal.saveError);
      setMessage(dict.portal.saved);
      window.location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : dict.portal.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="field">{dict.language}
        <select value={locale} onChange={(e) => setLocale(e.target.value)}>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="field">{dict.portal.theme}
        <select value={portalTheme} onChange={(e) => setPortalTheme(e.target.value)}>
          <option value="default">{dict.portal.themeDefault}</option>
          <option value="ocean">{dict.portal.themeOcean}</option>
          <option value="midnight">{dict.portal.themeMidnight}</option>
        </select>
      </label>
      <label className="field">{dict.portal.density}
        <select value={portalDensity} onChange={(e) => setPortalDensity(e.target.value)}>
          <option value="comfortable">{dict.portal.densityComfortable}</option>
          <option value="compact">{dict.portal.densityCompact}</option>
          <option value="relaxed">{dict.portal.densityRelaxed}</option>
        </select>
      </label>
      <button type="button" className="btn" onClick={() => void save()} disabled={busy}>
        {dict.portal.save}
      </button>
      {message ? <p className="notice" role="status">{message}</p> : null}
    </div>
  );
}
