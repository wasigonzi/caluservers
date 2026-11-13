import { ResetForm } from "@/components/account/AccountForms";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Nueva contraseña</h1>
      <p className="muted">El enlace es de un solo uso. Si caducó, pide otro.</p>
      <ResetForm token={token} />
    </main>
  );
}
