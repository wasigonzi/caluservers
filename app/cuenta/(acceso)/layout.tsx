import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { default: "Área de cliente", template: "%s · CaluServers" },
  robots: { index: false, follow: false },
};

/** Entrada, registro, recuperación y contratación: una tarjeta centrada con la marca. */
export default function AccountAccessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="account-auth">
      <div className="account-auth-glow" aria-hidden="true" />
      <Link className="account-auth-brand" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/monograma-cs.svg" width="40" height="40" alt="" />
        <span>
          CALU<span className="accent">SERVERS</span>
        </span>
      </Link>
      <div className="account-auth-card">{children}</div>
      <p className="account-auth-foot">
        <Link href="/">← Volver al sitio</Link>
      </p>
    </div>
  );
}
