import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

/**
 * Los textos legales (Términos/Privacidad/AUP) NO se traducen: siguen en
 * español. Cuando el visitante navega en inglés, se muestra este aviso
 * (en inglés) de que la versión en inglés está pendiente.
 */
export default async function LegalLanguageNotice() {
  const locale = await getRequestLocale();
  if (locale !== "en") return null;
  return (
    <p className="notice legal-language-notice" role="note">
      {getDictionary("en").legal.englishPending}
    </p>
  );
}
