import type { ReactNode } from "react";
import { AccountNav } from "@/components/account/AccountNav";

export function AccountFrame({
  kicker,
  title,
  lead,
  children,
}: {
  kicker: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <div className="account-page">
      <header className="page-hero">
        <span className="kicker">{kicker}</span>
        <h1>{title}</h1>
        <p className="lead">{lead}</p>
      </header>
      <div className="wrap account-wrap">
        <AccountNav />
        {children}
      </div>
    </div>
  );
}
