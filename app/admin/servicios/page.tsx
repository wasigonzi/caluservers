import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getAdminSession } from "@/lib/auth";
import AccessDenied from "@/components/admin/AccessDenied";
import { loadFailure, PAGE_SIZE, type LoadFailure } from "@/lib/admin-data";
import { dateOnly, pageNumber, searchTerm, serviceStatus } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { panelLabel } from "@/lib/panels";
import { initialPasswordOrNull, provisionConfiguration } from "@/lib/whm-provision";
import { NoteAction, ProvisionButton } from "@/components/admin/CommerceActions";
import {
  EmptyState,
  FilterTabs,
  LoadError,
  PageHeader,
  Pagination,
  SearchForm,
  StatusBadge,
  withQuery,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const STATES = ["pending_provision", "active", "cancelled"] as const;
type Filter = (typeof STATES)[number] | "all";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; p?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("services:view")) {
    return <AccessDenied permission="services:view" />;
  }
  const params = await searchParams;
  const q = searchTerm(params.q);
  const filter: Filter = (STATES as readonly string[]).includes(params.estado ?? "")
    ? (params.estado as Filter)
    : "all";
  const search: Prisma.CustomerServiceWhereInput = q
    ? {
        OR: [
          { planName: { contains: q, mode: "insensitive" } },
          { cpanelUser: { contains: q, mode: "insensitive" } },
          { order: { domain: { contains: q, mode: "insensitive" } } },
          { order: { user: { email: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : {};
  // «Pendientes» incluye las altas en curso: son el mismo trabajo por terminar.
  const where: Prisma.CustomerServiceWhereInput =
    filter === "all"
      ? search
      : filter === "pending_provision"
        ? { ...search, status: { in: ["pending_provision", "provisioning"] } }
        : { ...search, status: filter };
  const provision = await provisionConfiguration().catch(() => null);

  let failed: LoadFailure | null = null;
  let total = 0;
  let page = 1;
  let pages = 1;
  let counts = new Map<string, number>();
  let services: Prisma.CustomerServiceGetPayload<{
    include: { order: { include: { user: true } } };
  }>[] = [];
  try {
    const grouped = await db.customerService.groupBy({ by: ["status"], _count: true });
    counts = new Map(grouped.map((g) => [g.status, g._count]));
    total = await db.customerService.count({ where });
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = pageNumber(params.p, pages);
    services = await db.customerService.findMany({
      where,
      include: { order: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
  } catch (error) {
    failed = loadFailure(error, "servicios");
  }
  const all = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const tab = (label: string, key: Filter, count: number) => ({
    label,
    count,
    active: filter === key,
    href: withQuery("/admin/servicios", { estado: key === "all" ? undefined : key, q }),
  });

  return (
    <>
      <PageHeader
        eyebrow="ENTREGA"
        title="Servicios"
        description={
          <>
            Un servicio nace cuando se confirma el pago de su factura.{" "}
            {provision?.ready
              ? "El alta automática en WHM está lista."
              : "El alta automática en WHM no está lista: marca las altas a mano o "}
            {provision?.ready ? null : <Link href="/admin/provision">configúrala</Link>}
            {provision?.ready ? null : "."}
          </>
        }
      />
      <div className="toolbar">
        <FilterTabs
          label="Filtrar servicios por estado"
          items={[
            tab("Todos", "all", all),
            tab(
              "Pendientes de alta",
              "pending_provision",
              (counts.get("pending_provision") ?? 0) + (counts.get("provisioning") ?? 0),
            ),
            tab("Activos", "active", counts.get("active") ?? 0),
            tab("Cancelados", "cancelled", counts.get("cancelled") ?? 0),
          ]}
        />
        <SearchForm
          action="/admin/servicios"
          value={q}
          placeholder="Correo, dominio, plan o usuario cPanel"
          hidden={{ estado: filter === "all" ? "" : filter }}
        />
      </div>
      {failed ? <LoadError what="los servicios" reason={failed} /> : null}
      {!failed && !services.length ? (
        <EmptyState title={q ? "Ningún servicio coincide con la búsqueda." : "No hay servicios en este estado."} />
      ) : null}
      {services.length ? (
        <div className="table-wrap stack">
          <table>
            <thead>
              <tr>
                <th scope="col">Servicio</th>
                <th scope="col">Cliente</th>
                <th scope="col">cPanel</th>
                <th scope="col">Panel</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const pending = service.status === "pending_provision";
                const cancelled = service.status === "cancelled";
                // La ruta exige services:suspend para cambiar el estado y
                // para suspender/reactivar en el panel; sin él, los botones
                // no se muestran (la ruta respondería 403 igualmente).
                const canSuspend = session.permissions.includes("services:suspend");
                const canProvision = session.permissions.includes("services:provision");
                const canTerminate = session.permissions.includes("services:terminate");
                const cancellable = !cancelled && canSuspend;
                // Sin usuario cPanel y con dominio: el alta en WHM está
                // pendiente, tanto si el servicio espera el alta como si se
                // activó a mano (o se reactivó) sin cuenta.
                const needsProvision = Boolean(
                  !service.cpanelUser && service.order.domain && provision?.ready,
                );
                const provisionable = (pending || service.status === "active") && needsProvision && canProvision;
                // Cuenta en su panel (WHM, Plesk o DirectAdmin): sin ella no
                // hay nada que suspender, reactivar ni terminar fuera del panel.
                const panelUser =
                  (service.panelKey ?? "whm") === "whm"
                    ? (service.panelAccountId ?? service.cpanelUser)
                    : service.panelAccountId;
                const hasPanelAccount = Boolean(panelUser);
                return (
                  <tr key={service.id}>
                    <td>
                      <strong>{service.planName}</strong>
                      <span className="cell-sub">
                        {service.order.domain || "sin dominio"} · {dateOnly(service.createdAt)}
                      </span>
                    </td>
                    <td>
                      <Link className="row-link" href={`/admin/clientes/${service.userId}`}>
                        {service.order.user.email}
                      </Link>
                    </td>
                    <td>
                      {service.cpanelUser || "—"}
                      {service.cpanelUser ? (
                        <span className="cell-sub">
                          Contraseña inicial:{" "}
                          <code>
                            {initialPasswordOrNull(service.cpanelPasswordEncrypted) ?? "no disponible"}
                          </code>
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <strong>{panelLabel(service.panelKey)}</strong>
                      <span className="cell-sub">{panelUser || "sin cuenta"}</span>
                    </td>
                    <td>
                      <StatusBadge info={serviceStatus(service.status)} />
                      {service.note ? <span className="cell-sub">{service.note}</span> : null}
                      {service.provisionError ? (
                        <span className="cell-sub error">
                          {service.provisionError}
                          {service.provisionAttempts ? ` (intentos: ${service.provisionAttempts})` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <div className="row-actions">
                        {provisionable ? (
                          <ProvisionButton serviceId={service.id} />
                        ) : null}
                        {pending && canSuspend ? (
                          <NoteAction
                            trigger="Marcar alta manual"
                            title={`Marcar como activo: ${service.planName}`}
                            description="Úsalo cuando ya creaste el servicio por tu cuenta. No llama a ningún panel ni envía credenciales al cliente."
                            noteLabel="Nota de alta manual (qué se entregó y cómo)"
                            confirmLabel="Marcar como activo"
                            payload={{ action: "service-status", serviceId: service.id, status: "active" }}
                            tone="secondary"
                          />
                        ) : null}
                        {cancellable ? (
                          <NoteAction
                            trigger="Cancelar"
                            title={`Cancelar: ${service.planName}`}
                            description="El servicio queda cancelado en el panel y en la cuenta del cliente, y su suscripción deja de generar renovaciones. Si tiene cuenta en su panel y el alta automática está configurada, se intenta suspenderla; si no se puede, el motivo queda visible en esta tabla y la cuenta sigue activa en el servidor."
                            noteLabel="Motivo de la cancelación"
                            confirmLabel="Cancelar servicio"
                            payload={{ action: "service-status", serviceId: service.id, status: "cancelled" }}
                            tone="danger"
                          />
                        ) : null}
                        {cancelled && canSuspend ? (
                          <NoteAction
                            trigger="Reactivar"
                            title={`Reactivar: ${service.planName}`}
                            description="Solo reactiva el servicio en el panel y en la cuenta del cliente. No llama a ningún panel ni recrea la cuenta: si la cuenta se borró, créala de nuevo en su panel. Si el servicio no tiene cuenta, tras reactivar aparece aquí el botón de alta."
                            noteLabel="Motivo de la reactivación"
                            confirmLabel="Reactivar servicio"
                            payload={{ action: "service-status", serviceId: service.id, status: "active" }}
                            tone="secondary"
                          />
                        ) : null}
                        {!cancelled && hasPanelAccount && canSuspend ? (
                          <NoteAction
                            trigger="Suspender"
                            title={`Suspender cuenta: ${service.planName}`}
                            description={`Suspende la cuenta ${panelUser} en ${panelLabel(service.panelKey)} sin cancelar el servicio. El servicio sigue activo en el panel y en la cuenta del cliente.`}
                            noteLabel="Motivo de la suspensión"
                            confirmLabel="Suspender cuenta"
                            payload={{ action: "service-suspend", serviceId: service.id }}
                            tone="secondary"
                          />
                        ) : null}
                        {!cancelled && hasPanelAccount && canSuspend ? (
                          <NoteAction
                            trigger="Reactivar cuenta"
                            title={`Reactivar cuenta: ${service.planName}`}
                            description={`Reactiva la cuenta ${panelUser} en ${panelLabel(service.panelKey)} sin cambiar el estado del servicio.`}
                            noteLabel="Motivo de la reactivación"
                            confirmLabel="Reactivar cuenta"
                            payload={{ action: "service-unsuspend", serviceId: service.id }}
                            tone="secondary"
                          />
                        ) : null}
                        {hasPanelAccount && canTerminate ? (
                          <NoteAction
                            trigger="Terminar"
                            title={`Terminar cuenta: ${service.planName}`}
                            description={`Borra la cuenta ${panelUser} en ${panelLabel(service.panelKey)}. Es irreversible: la cuenta y sus datos se pierden. No cambia el estado del servicio: cancélalo antes si ya no se va a cobrar.`}
                            noteLabel="Motivo de la terminación"
                            confirmLabel="Terminar cuenta"
                            payload={{ action: "service-terminate", serviceId: service.id, confirm: "true" }}
                            tone="danger"
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pagination
        page={page}
        pages={pages}
        total={total}
        hrefFor={(p) =>
          withQuery("/admin/servicios", { estado: filter === "all" ? undefined : filter, q, p })
        }
      />
    </>
  );
}
