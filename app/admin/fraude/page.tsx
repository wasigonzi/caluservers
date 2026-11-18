import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import AccessDenied from "@/components/admin/AccessDenied";
import { loadFailure, type LoadFailure } from "@/lib/admin-data";
import { dateTime } from "@/lib/admin-format";
import { db } from "@/lib/db";
import FraudFlagsManager, { type FraudFlagItem } from "@/components/admin/FraudFlagsManager";
import { EmptyState, LoadError, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * Revisión de fraude (Fase 6). Permiso: orders:view — los flags nacen de
 * pedidos y los revisa quien gestiona pedidos (documentado en
 * docs/FRAUDE.md). Aprobar marca "cleared"; confirmar fraude marca
 * "confirmed". Ninguna de las dos acciones bloquea ni desbloquea un pago:
 * el pago nunca se bloqueó por un flag.
 */
export default async function FraudPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("orders:view")) {
    return <AccessDenied permission="orders:view" />;
  }

  let failed: LoadFailure | null = null;
  let openCount = 0;
  let open: FraudFlagItem[] = [];
  let reviewed: FraudFlagItem[] = [];
  try {
    openCount = await db.fraudFlag.count({ where: { status: "open" } });
    const openRows = await db.fraudFlag.findMany({
      where: { status: "open" },
      include: { rule: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const reviewedRows = await db.fraudFlag.findMany({
      where: { status: { in: ["cleared", "confirmed"] } },
      include: { rule: true },
      orderBy: { reviewedAt: "desc" },
      take: 20,
    });
    const toItem = (row: (typeof openRows)[number]): FraudFlagItem => ({
      id: row.id,
      userId: row.userId,
      orderId: row.orderId,
      ruleName: row.rule?.name ?? null,
      reason: row.reason,
      status: row.status,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt ? dateTime(row.reviewedAt) : null,
      createdAt: dateTime(row.createdAt),
    });
    open = openRows.map(toItem);
    reviewed = reviewedRows.map(toItem);
  } catch (error) {
    failed = loadFailure(error, "flags de fraude");
  }

  return (
    <>
      <PageHeader
        eyebrow="FRAUDE"
        title="Fraude"
        description={`${openCount} flag${openCount === 1 ? "" : "s"} abierto${openCount === 1 ? "" : "s"}. Las reglas solo marcan: ningún pago se bloquea por un flag. El bloqueo real es decisión del dueño (docs/FRAUDE.md).`}
      />
      {failed ? (
        <LoadError what="los flags de fraude" reason={failed} />
      ) : open.length === 0 && reviewed.length === 0 ? (
        <EmptyState title="Sin flags de fraude">Todavía no hay ninguna marca de las reglas de fraude.</EmptyState>
      ) : (
        <>
          <h2>Abiertos</h2>
          <FraudFlagsManager flags={open} />
          {reviewed.length > 0 ? (
            <>
              <h2>Revisados recientemente</h2>
              <FraudFlagsManager flags={reviewed} />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
