import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { listPlugins, type PluginPublicView } from "@/lib/plugins";
import AccessDenied from "@/components/admin/AccessDenied";
import PluginCard from "@/components/admin/PluginCard";
import { EmptyState, LoadError, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plugins" };

const KIND_TITLES: { kind: string; title: string; description: string }[] = [
  {
    kind: "payment",
    title: "Pagos",
    description: "Pasarelas que cobran las facturas. Sin credenciales guardadas, un plugin de pago no puede cobrar.",
  },
  {
    kind: "registrar",
    title: "Registradores de dominios",
    description: "Registro, traslado y renovación de dominios.",
  },
  {
    kind: "panel",
    title: "Panel de control",
    description: "Alta y gestión de cuentas de hosting.",
  },
];

export default async function PluginsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("settings:write")) {
    return <AccessDenied permission="settings:write" />;
  }
  let plugins: PluginPublicView[];
  try {
    plugins = await listPlugins();
  } catch {
    return (
      <>
        <PageHeader
          eyebrow="CONFIGURACIÓN"
          title="Plugins"
          description="Pasarelas de pago, registradores de dominios y paneles de hosting."
        />
        <LoadError what="la lista de plugins" reason="migration" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="CONFIGURACIÓN"
        title="Plugins"
        description="Pasarelas de pago, registradores de dominios y paneles de hosting. Los secretos se guardan cifrados y nunca se muestran; un plugin de pago sin credenciales no cobra nada."
      />
      {KIND_TITLES.map(({ kind, title, description }) => {
        const group = plugins.filter((plugin) => plugin.kind === kind);
        return (
          <section key={kind} aria-labelledby={`plugins-${kind}`} style={{ marginBottom: 24 }}>
            <h2 id={`plugins-${kind}`}>{title}</h2>
            <p className="muted">{description}</p>
            {group.length === 0 ? (
              <EmptyState title="Aún no hay plugins de este tipo">
                {kind === "registrar"
                  ? "Los registradores (Porkbun y siguientes) llegan en la Fase 3."
                  : "Se añadirán desde el manifiesto, sin tocar esta pantalla."}
              </EmptyState>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {group.map((plugin) => (
                  <PluginCard key={plugin.key} initial={plugin} />
                ))}
              </div>
            )}
          </section>
        );
      })}
      <p className="muted">
        Cada cambio queda en el registro de actividad. Añadir un plugin nuevo
        solo exige su manifiesto y su adaptador: ver docs/PLUGINS.md.
      </p>
    </>
  );
}
