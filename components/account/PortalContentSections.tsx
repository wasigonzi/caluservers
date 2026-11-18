import Link from "next/link";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getPortalContentSections } from "@/lib/content-kb-db";

/**
 * Secciones de contenido publicado en el portal (/cuenta). Solo se
 * renderiza si hay al menos una sección visible con ítems publicados;
 * si no hay nada, no se muestra nada (sin texto de relleno).
 */
export default async function PortalContentSections({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const sections = await getPortalContentSections(locale);
  if (!sections.length) return null;
  return (
    <>
      {sections.map((section) => (
        <section key={section.key} className="panel portal-content-section" aria-labelledby={`portal-${section.key}`}>
          <h2 id={`portal-${section.key}`}>{section.title}</h2>
          {section.subtitle ? <p className="muted">{section.subtitle}</p> : null}
          {section.key === "faq" ? (
            <dl className="portal-faq">
              {section.items.map((item) => (
                <div key={item.slug}>
                  <dt>{item.title}</dt>
                  <dd>{item.body}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <ul className="plain-list">
              {section.items.map((item) => {
                const fields =
                  item.fieldsJson && typeof item.fieldsJson === "object" && !Array.isArray(item.fieldsJson)
                    ? (item.fieldsJson as Record<string, unknown>)
                    : {};
                const author = typeof fields.author === "string" ? fields.author : "";
                const role = typeof fields.role === "string" ? fields.role : "";
                const url = typeof fields.url === "string" ? fields.url : "";
                return (
                  <li key={item.slug}>
                    <span>
                      <strong>{item.title}</strong>
                      {author || role ? (
                        <span className="muted"> · {[author, role].filter(Boolean).join(" — ")}</span>
                      ) : null}
                      <span className="portal-content-body">{item.body}</span>
                    </span>
                    {url ? (
                      <Link href={url} target="_blank" rel="noreferrer">↗</Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="muted">
            <Link href="/kb">{dict.nav.knowledgeBase} →</Link>
          </p>
        </section>
      ))}
    </>
  );
}
