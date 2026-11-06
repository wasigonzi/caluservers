import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap" style={{ padding: "12vh 28px", textAlign: "center" }}>
      <p className="kicker">404</p>
      <h1>
        Página no encontrada
      </h1>
      <p className="lead" style={{ margin: "0 auto 24px" }}>
        El enlace no existe o se ha movido. Vuelve al inicio o explora nuestros
        planes.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link className="btn primary" href="/">
          Ir al inicio
        </Link>
        <Link className="btn secondary" href="/web-hosting">
          Ver hosting
        </Link>
        <Link className="btn secondary" href="/vps">
          Ver VPS
        </Link>
      </div>
    </div>
  );
}
