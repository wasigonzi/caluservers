import type { Metadata } from "next";
import AccountShell from "@/components/account/AccountShell";
import { accountBadges, requireCustomer } from "@/lib/account-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Mi cuenta", template: "%s · Mi cuenta CaluServers" },
  robots: { index: false, follow: false },
};

export default async function AccountPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  const badges = await accountBadges(user.id);
  return (
    <AccountShell name={user.name} email={user.email} badges={badges}>
      {children}
    </AccountShell>
  );
}
