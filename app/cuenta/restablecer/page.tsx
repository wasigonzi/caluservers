import { AccountFrame } from "@/components/account/AccountFrame";
import { ResetForm } from "@/components/account/AccountForms";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <AccountFrame
      kicker="Cuenta CaluServers"
      title="Nueva contraseña"
      lead="El enlace es de un solo uso. Si caducó, pide otro."
    >
      <section className="account-card glass">
        <ResetForm token={token} />
      </section>
    </AccountFrame>
  );
}
