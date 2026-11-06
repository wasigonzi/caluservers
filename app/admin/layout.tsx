import { isAdmin } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) return children;
  const email = process.env.ADMIN_EMAIL || undefined;
  return <AdminShell email={email}>{children}</AdminShell>;
}
