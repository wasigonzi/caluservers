/** Render known catalog counts immediately: animation must not fabricate availability. */
export default function CatalogPlanCount({ count }: { count: number | null }) {
  return (
    <span aria-busy={count === null} role={count === null ? "status" : undefined}>
      {count === null ? "Cargando catálogo…" : count}
    </span>
  );
}
