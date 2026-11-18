import { NextResponse } from "next/server";
import {
  authorizeCronRequest,
  claimBillingRun,
  finishBillingRun,
  runDayOf,
} from "@/lib/billing-cron";
import { CommerceError } from "@/lib/commerce";
import {
  runDomainRenewalReminders,
  syncTldPrices,
  tryAutoRenewWithCredit,
} from "@/lib/domains";
import { db } from "@/lib/db";

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
 * Cron diario de dominios (08:00 UTC en vercel.json):
 * - sincroniza los precios de TLD desde el registrador,
 * - envía los recordatorios de renovación,
 * - renueva con crédito los dominios activos con autoRenew que vencen en
 *   7 días o menos (un dominio que falla no tumba la corrida).
 *
 * Solo GET y solo con `Authorization: Bearer <CRON_SECRET>`: sin secreto
 * configurado responde 503, sin cabecera o con una incorrecta 401. Una
 * corrida por día: si ya existe la de hoy, se devuelve sin re-ejecutar.
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
    claim = await claimBillingRun("domains", runDay);
  } catch {
    return json({ ok: false, error: "No se pudo registrar la corrida." }, 503);
  }
  if (claim.alreadyRan) {
    return json({
      ok: true,
      alreadyRan: true,
      kind: "domains",
      runDay,
      stats: {
        prices: null,
        reminders: null,
        autoRenew: null,
        processed: claim.run.processed,
        succeeded: claim.run.succeeded,
        failed: claim.run.failed,
      },
    });
  }

  const now = new Date();
  const stats = {
    prices: { updated: 0, failed: 0, skipped: false, details: [] as string[] },
    reminders: { processed: 0, succeeded: 0, failed: 0, details: [] as string[] },
    autoRenew: { processed: 0, succeeded: 0, failed: 0, details: [] as string[] },
  };

  try {
    const prices = await syncTldPrices();
    stats.prices = {
      updated: prices.updated ?? 0,
      failed: prices.failed ?? 0,
      skipped: prices.skipped ?? false,
      details: [],
    };
  } catch (error) {
    stats.prices.failed += 1;
    stats.prices.details.push(
      `precios: ${error instanceof Error ? error.message : "no se pudieron sincronizar"}`,
    );
  }

  try {
    const reminders = await runDomainRenewalReminders({ now });
    stats.reminders = {
      processed: reminders.processed ?? 0,
      succeeded: reminders.succeeded ?? 0,
      failed: reminders.failed ?? 0,
      details: [],
    };
  } catch (error) {
    stats.reminders.failed += 1;
    stats.reminders.details.push(
      `recordatorios: ${error instanceof Error ? error.message : "error"}`,
    );
  }

  // Auto-renovación con crédito: solo dominios activos, con autoRenew y
  // que vencen en 7 días o menos. Un fallo por dominio no tumba la corrida.
  // `renewed: false` no es un error (p. ej. sin crédito): queda anotado,
  // no contado como fallo.
  try {
    const horizon = new Date(now.getTime() + 7 * 86_400_000);
    const due = await db.registeredDomain.findMany({
      where: { status: "active", autoRenew: true, expiresAt: { lte: horizon } },
      orderBy: { expiresAt: "asc" },
      take: 50,
    });
    for (const domain of due) {
      stats.autoRenew.processed += 1;
      try {
        const outcome = await tryAutoRenewWithCredit(domain);
        if (outcome.renewed) {
          stats.autoRenew.succeeded += 1;
        } else {
          stats.autoRenew.details.push(
            `${domain.domain}: no renovado (${outcome.reason})`,
          );
        }
      } catch (error) {
        stats.autoRenew.failed += 1;
        stats.autoRenew.details.push(
          `${domain.domain}: ${error instanceof Error ? error.message : "error"}`,
        );
      }
    }
  } catch (error) {
    stats.autoRenew.failed += 1;
    stats.autoRenew.details.push(
      `lista de auto-renovación: ${error instanceof Error ? error.message : "error"}`,
    );
  }

  const totals = {
    processed:
      stats.prices.updated + stats.prices.failed +
      stats.reminders.processed + stats.autoRenew.processed,
    succeeded: stats.prices.updated + stats.reminders.succeeded + stats.autoRenew.succeeded,
    failed: stats.prices.failed + stats.reminders.failed + stats.autoRenew.failed,
    details: [
      ...stats.prices.details,
      ...stats.reminders.details,
      ...stats.autoRenew.details,
    ],
  };
  await finishBillingRun(claim.run.id, totals).catch(() => null);
  return json({ ok: true, alreadyRan: false, kind: "domains", runDay, stats });
}
