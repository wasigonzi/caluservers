import "server-only";
import { sanitizeAudit } from "@/lib/audit-sanitize";
import { db } from "@/lib/db";
import type { ControlPanel } from "@/lib/plugin-types";
import {
  isPanelKey,
  suspendServiceAccount,
  terminateServiceAccount,
  unsuspendServiceAccount,
  type PanelKey,
  type SuspendOutcome,
  type TerminateOutcome,
  type UnsuspendOutcome,
} from "@/lib/whm-provision";
import { whmPanel } from "./whm-panel";
// CONTRATO CON EL FRENTE B (Fase 4): el frente B crea estos dos módulos con
// estos nombres exactos y estas claves: `pleskPanel` con key "plesk" y
// `directAdminPanel` con key "directadmin". Mientras no existan, este
// archivo no compila y `tsc` lo señala; el coordinador integra al final.
import { pleskPanel } from "./plesk";
import { directAdminPanel } from "./directadmin";

/**
 * Dispatcher de paneles por servicio (Fase 4, frente A).
 *
 * Cada `CustomerService` tiene `panelKey` (por defecto "whm") y
 * `panelAccountId` (el usuario en ese panel; para WHM es el `cpanelUser`).
 * Estas funciones resuelven el panel del servicio y actúan en él:
 * - "whm" → las funciones de `lib/whm-provision.ts` (mismo patrón de
 *   siempre: nunca lanzan, registran el evento y dejan el motivo en
 *   `provisionError`).
 * - "plesk" / "directadmin" → el adaptador `ControlPanel` del frente B,
 *   con el mismo registro de eventos y el mismo motivo visible.
 * - "none" (o servicio sin cuenta en ningún panel) → no se intenta nada y
 *   el motivo queda registrado como hasta hoy.
 *
 * Nada existente cambia de comportamiento: el valor por defecto en todo es
 * "whm" y un servicio sin `panelKey` se trata como WHM.
 */

export type { PanelKey };

/** Etiqueta del panel para la UI del admin. */
export function panelLabel(key: string | null | undefined): string {
  switch (key ?? "whm") {
    case "whm":
      return "WHM";
    case "plesk":
      return "Plesk";
    case "directadmin":
      return "DirectAdmin";
    case "none":
      return "Sin panel";
    default:
      return "Sin panel";
  }
}

/**
 * Adaptador del panel por clave. "none" devuelve null (no hay panel).
 * Una clave desconocida lanza: no se actúa en un panel que no existe.
 */
export function getControlPanel(key: string): ControlPanel | null {
  switch (key) {
    case "whm":
      return whmPanel;
    case "plesk":
      return pleskPanel;
    case "directadmin":
      return directAdminPanel;
    case "none":
      return null;
    default:
      throw new Error(`Panel no válido: ${key}. Valores: whm, plesk, directadmin, none.`);
  }
}

type PanelService = {
  id: string;
  panelKey: string | null;
  panelAccountId: string | null;
  cpanelUser: string | null;
};

/** Usuario de la cuenta en su panel. Para WHM vale el `cpanelUser` heredado. */
export function panelAccountUser(service: PanelService): string | null {
  if ((service.panelKey ?? "whm") === "whm") {
    return service.panelAccountId ?? service.cpanelUser ?? null;
  }
  return service.panelAccountId ?? null;
}

async function recordPanelEvent(
  serviceId: string,
  actor: string,
  action: string,
  details: string,
): Promise<void> {
  await db.commerceEvent
    .create({
      data: { actor, action, entityId: serviceId, details: sanitizeAudit(details) },
    })
    .catch(() => {});
}

async function flagPanelError(serviceId: string, message: string | null): Promise<void> {
  await db.customerService
    .update({ where: { id: serviceId }, data: { provisionError: message } })
    .catch(() => {});
}

async function loadService(serviceId: string): Promise<PanelService | null> {
  return db.customerService
    .findUnique({ where: { id: serviceId } })
    .catch(() => null);
}

type PanelAction = "suspend" | "unsuspend" | "terminate";

const PANEL_ACTION_EVENTS: Record<
  PanelAction,
  { done: string; failed: string; skipped: string }
> = {
  suspend: {
    done: "service.suspended",
    failed: "service.suspend_failed",
    skipped: "service.suspend_skipped",
  },
  unsuspend: {
    done: "service.unsuspended",
    failed: "service.unsuspend_failed",
    skipped: "service.unsuspend_skipped",
  },
  terminate: {
    done: "service.terminated",
    failed: "service.terminate_failed",
    skipped: "service.terminate_skipped",
  },
};

/**
 * Ejecuta una acción de panel para un servicio, resolviendo el panel por
 * `service.panelKey`. Nunca lanza: un fallo del panel no rompe la
 * cancelación ni el cron; el motivo queda en el resultado, en el diario y
 * en `provisionError`.
 */
async function runServicePanelAction(
  serviceId: string,
  actor: string,
  action: PanelAction,
): Promise<{ attempted: boolean; done: boolean; reason: string }> {
  const service = await loadService(serviceId);
  if (!service) {
    return { attempted: false, done: false, reason: "servicio no encontrado" };
  }
  const key = service.panelKey ?? "whm";
  const events = PANEL_ACTION_EVENTS[action];
  if (!isPanelKey(key)) {
    const reason = `Panel no válido en el servicio: ${key}.`;
    await recordPanelEvent(serviceId, actor, events.skipped, reason);
    await flagPanelError(serviceId, reason);
    return { attempted: false, done: false, reason };
  }
  const user = panelAccountUser(service);
  if (key === "none" || !user) {
    const reason = "sin cuenta en ningún panel";
    await recordPanelEvent(serviceId, actor, events.skipped, `panel=${key};${reason}`);
    await flagPanelError(
      serviceId,
      `El servicio no tiene cuenta en ningún panel (${panelLabel(key)}): nada que ${action === "suspend" ? "suspender" : action === "unsuspend" ? "reactivar" : "terminar"} fuera del panel.`,
    );
    return { attempted: false, done: false, reason };
  }
  // WHM usa sus funciones por servicio (con su registro y su motivo).
  if (key === "whm") {
    if (action === "suspend") {
      const result = await suspendServiceAccount({ serviceId, actor });
      return { attempted: result.attempted, done: result.suspended, reason: result.reason };
    }
    if (action === "unsuspend") {
      const result = await unsuspendServiceAccount({ serviceId, actor });
      return { attempted: result.attempted, done: result.unsuspended, reason: result.reason };
    }
    const result = await terminateServiceAccount({ serviceId, actor });
    return { attempted: result.attempted, done: result.terminated, reason: result.reason };
  }
  // Otros paneles: el adaptador ControlPanel del frente B.
  const panel = getControlPanel(key);
  if (!panel) {
    return { attempted: false, done: false, reason: "sin cuenta en ningún panel" };
  }
  try {
    if (action === "suspend") {
      await panel.suspendAccount({ username: user, reason: "Suspendido en CaluServers" });
    } else if (action === "unsuspend") {
      await panel.unsuspendAccount({ username: user });
    } else {
      await panel.terminateAccount({ username: user });
    }
  } catch (error) {
    // El mensaje se lee sin `instanceof Error`: los adaptadores pueden
    // lanzar errores de otro reino (p. ej. en pruebas) y `instanceof` no
    // los reconocería.
    const message =
      error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : `El panel ${panelLabel(key)} no completó la operación.`;
    await recordPanelEvent(serviceId, actor, events.failed, `user=${user};panel=${key}`);
    await flagPanelError(serviceId, message);
    return { attempted: true, done: false, reason: message };
  }
  if (action === "terminate") {
    // La cuenta ya no existe en ese panel: se borra el usuario guardado,
    // como hace la terminación WHM, para que un alta posterior no lo reuse.
    await db.customerService
      .update({
        where: { id: serviceId },
        data: { cpanelUser: null, panelAccountId: null },
      })
      .catch(() => {});
  }
  const reason = `Cuenta ${user} ${action === "suspend" ? "suspendida" : action === "unsuspend" ? "reactivada" : "terminada"} en ${panelLabel(key)}.`;
  await recordPanelEvent(serviceId, actor, events.done, `user=${user};panel=${key}`);
  await flagPanelError(serviceId, null);
  return { attempted: true, done: true, reason };
}

export async function suspendServicePanel(input: {
  serviceId: string;
  actor: string;
}): Promise<SuspendOutcome> {
  const result = await runServicePanelAction(input.serviceId, input.actor, "suspend");
  return { attempted: result.attempted, suspended: result.done, reason: result.reason };
}

export async function unsuspendServicePanel(input: {
  serviceId: string;
  actor: string;
}): Promise<UnsuspendOutcome> {
  const result = await runServicePanelAction(input.serviceId, input.actor, "unsuspend");
  return { attempted: result.attempted, unsuspended: result.done, reason: result.reason };
}

export async function terminateServicePanel(input: {
  serviceId: string;
  actor: string;
}): Promise<TerminateOutcome> {
  const result = await runServicePanelAction(input.serviceId, input.actor, "terminate");
  return { attempted: result.attempted, terminated: result.done, reason: result.reason };
}
