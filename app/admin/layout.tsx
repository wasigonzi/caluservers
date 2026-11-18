import type { Metadata } from "next";
import { getAdminSession } from "@/lib/auth";
import { navCounts } from "@/lib/admin-data";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s · Panel CaluServers" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) return children;
  const badges = await navCounts();
  return (
    <AdminShell email={session.email} badges={badges} permissions={session.permissions}>
      {children}
    </AdminShell>
  );
}
