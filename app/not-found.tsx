import Link from "next/link";
import { getPageContent } from "@/lib/page-content-db";
import { pc } from "@/lib/page-content";

export default async function NotFound() {
  const payload = await getPageContent("/404");
  const kicker = pc(payload, "kicker", "404");
  const title = pc(payload, "title", "Página no encontrada");
  const lead = pc(
    payload,
    "lead",
    "El enlace no existe o se ha movido. Vuelve al inicio o explora nuestros planes.",
  );
  const homeCta = pc(payload, "homeCta", "Ir al inicio");
  const hostingCta = pc(payload, "hostingCta", "Ver hosting");
  const vpsCta = pc(payload, "vpsCta", "Ver VPS");

  return (
    <div className="wrap" style={{ padding: "12vh 28px", textAlign: "center" }}>
      <p className="kicker">{kicker}</p>
      <h1>{title}</h1>
      <p className="lead" style={{ margin: "0 auto 24px" }}>
        {lead}
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link className="btn primary" href="/">
          {homeCta}
        </Link>
        <Link className="btn secondary" href="/web-hosting">
          {hostingCta}
        </Link>
        <Link className="btn secondary" href="/vps">
          {vpsCta}
        </Link>
      </div>
    </div>
  );
}
