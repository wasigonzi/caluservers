import type { Metadata } from "next";
import { isAdmin } from "@/lib/auth";
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
  if (!(await isAdmin())) return children;
  const email = process.env.ADMIN_EMAIL || undefined;
  const badges = await navCounts();
  return (
    <AdminShell email={email} badges={badges}>
      {children}
    </AdminShell>
  );
}
