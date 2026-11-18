import { NextResponse } from "next/server";
import {
  authorizeCronRequest,
  claimBillingRun,
  finishBillingRun,
  runDayOf,
  runRemindersCron,
} from "@/lib/billing-cron";
import { CommerceError } from "@/lib/commerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Cron diario de recordatorios (07:00 UTC en vercel.json): avisa de las
 * facturas impagas que vencen en 7, 3 o 1 días, un recordatorio por
 * factura y umbral.
 *
 * Solo GET y solo con `Authorization: Bearer <CRON_SECRET>`: sin secreto
 * configurado responde 503, sin cabecera o con una incorrecta 401. Una
 * corrida por día y tipo: si ya existe la de hoy, se devuelve sin
 * re-ejecutar. La respuesta nunca incluye secretos.
 */
export async function GET(req: Request) {
  try {
    authorizeCronRequest(req.headers);
  } catch (error) {
    if (error instanceof CommerceError) {
      return json({ ok: false, error: error.message }, error.status);
    }
    return json({ ok: false, error: "No autorizado." }, 401);
  }
  const runDay = runDayOf(new Date());
  let claim;
  try {
    claim = await claimBillingRun("reminders", runDay);
  } catch {
    return json({ ok: false, error: "No se pudo registrar la corrida." }, 503);
  }
  if (claim.alreadyRan) {
    return json({
      ok: true,
      alreadyRan: true,
      kind: "reminders",
      runDay,
      processed: claim.run.processed,
      succeeded: claim.run.succeeded,
      failed: claim.run.failed,
    });
  }
  const stats = await runRemindersCron({ now: new Date() });
  await finishBillingRun(claim.run.id, stats).catch(() => null);
  return json({
    ok: true,
    alreadyRan: false,
    kind: "reminders",
    runDay,
    processed: stats.processed,
    succeeded: stats.succeeded,
    failed: stats.failed,
  });
}
