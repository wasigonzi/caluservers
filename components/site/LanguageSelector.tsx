"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Selector de idioma persistente (cookie `calu-locale`, 1 año).
 * En el portal, la preferencia guardada en la cuenta (User.locale) se
 * sincroniza con la misma cookie desde /cuenta/perfil.
 */
export default function LanguageSelector({ locale }: { locale: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <label className="language-selector">
      <span className="sr-only">Idioma / Language</span>
      <select
        aria-label="Idioma / Language"
        value={locale === "en" ? "en" : "es"}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          try {
            await fetch("/api/locale", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ locale: e.target.value }),
            });
          } finally {
            setBusy(false);
            router.refresh();
          }
        }}
      >
        <option value="es">Español</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
