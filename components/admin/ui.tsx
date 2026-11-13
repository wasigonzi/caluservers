import Link from "next/link";
import { Search } from "lucide-react";
import type { StatusInfo } from "@/lib/admin-format";

/** Piezas de presentación del panel. Sin estado: sirven en páginas de servidor. */

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <p className="studio-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="muted page-head-sub">{description}</p> : null}
      </div>
      {children ? <div className="page-head-actions">{children}</div> : null}
    </header>
  );
}

export function StatusBadge({ info }: { info: StatusInfo }) {
  return <span className={`badge badge-${info.tone}`}>{info.label}</span>;
}

export type TabItem = { label: string; href: string; active: boolean; count?: number };

export function FilterTabs({ label, items }: { label: string; items: TabItem[] }) {
  return (
    <nav className="filter-tabs" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={item.active ? "filter-tab active" : "filter-tab"}
          aria-current={item.active ? "page" : undefined}
        >
          {item.label}
          {item.count !== undefined ? <span className="filter-count">{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** Búsqueda por GET: funciona sin JavaScript y la URL se puede compartir. */
export function SearchForm({
  action,
  value,
  placeholder,
  hidden = {},
}: {
  action: string;
  value: string;
  placeholder: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form className="search-form" action={action} method="get" role="search">
      {Object.entries(hidden).map(([name, v]) =>
        v ? <input key={name} type="hidden" name={name} value={v} /> : null,
      )}
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={80}
      />
      <button className="btn secondary small" type="submit">
        Buscar
      </button>
    </form>
  );
}

export function Pagination({
  page,
  pages,
  total,
  hrefFor,
}: {
  page: number;
  pages: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  if (pages <= 1) {
    return total ? <p className="muted table-foot">{total} en total</p> : null;
  }
  return (
    <nav className="pagination" aria-label="Paginación">
      <span className="muted">
        Página {page} de {pages} · {total} en total
      </span>
      <span className="pagination-links">
        {page > 1 ? (
          <Link className="btn secondary small" href={hrefFor(page - 1)}>
            ← Anterior
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="btn secondary small" href={hrefFor(page + 1)}>
            Siguiente →
          </Link>
        ) : null}
      </span>
    </nav>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {children ? <p className="muted">{children}</p> : null}
    </div>
  );
}

export function LoadError({ what }: { what: string }) {
  return (
    <p className="error load-error" role="alert">
      No se pudo leer {what}. Aplica las migraciones (npx prisma migrate deploy) y revisa la
      conexión con la base de datos.
    </p>
  );
}

/** Construye un `href` conservando los filtros activos. */
export function withQuery(base: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || (key === "p" && Number(value) <= 1)) continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}
