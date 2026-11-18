import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";

/**
 * Rechazo por falta de permiso en una página del panel (Fase 1, tramo D).
 * El menú ya oculta la sección; esto es la segunda barrera para quien
 * llegue por URL directa. No filtra qué existe: solo nombra el permiso.
 */
export default function AccessDenied({ permission }: { permission?: string }) {
  return (
    <>
      <PageHeader
        eyebrow="ACCESO DENEGADO"
        title="Sin permiso para ver esta sección"
        description={
          permission
            ? `Tu cuenta no tiene el permiso ${permission}. Pide a un administrador que te lo asigne o que haga el cambio por ti.`
            : "Tu cuenta no tiene permiso para ver esta sección. Pide a un administrador que te lo asigne o que haga el cambio por ti."
        }
      />
      <p>
        <Link className="btn secondary" href="/admin">
          Volver al panel
        </Link>
      </p>
    </>
  );
}
