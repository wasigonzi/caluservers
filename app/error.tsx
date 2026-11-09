"use client";

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Esta pantalla no pudo cargarse</h1>
      <p>
        No se muestran datos de ejemplo ni se da por hecho un acceso. Si falta una tabla o la configuración, hay que corregirlo antes de continuar.
      </p>
      {error.digest ? <p>Referencia: {error.digest}</p> : null}
      <button className="btn" type="button" onClick={() => reset()}>Reintentar</button>
    </main>
  );
}
