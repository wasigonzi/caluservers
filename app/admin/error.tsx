"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="glass" role="alert">
      <h1>El panel no pudo completar esta pantalla</h1>
      <p>
        No se muestran datos de ejemplo ni se cambia el acceso. Si falta una tabla o la base no responde, el resto del panel puede seguir abierto.
      </p>
      {error.digest ? <p>Referencia: {error.digest}</p> : null}
      <button className="btn" type="button" onClick={() => reset()}>Reintentar</button>
    </section>
  );
}
