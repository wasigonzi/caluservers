// Especificaciones de planes VPS extraídas de sus características reales
// (features del catálogo, p. ej. "1 vCore", "2GB DDR5 5600 MHz",
// "20 GB SSD NVMe GEN 5", "5TB @ 1Gbps shared uplink").
// Nada se inventa: si un dato no se puede extraer, queda como null.
import type { Plan } from "./catalog";

export interface VpsSpecs {
  vCores: number | null;
  ramGb: number | null;
  storageGb: number | null;
  uplink: string | null;
  ip: string | null;
}

function firstNumber(feature: string | undefined, re: RegExp): number | null {
  if (!feature) return null;
  const m = feature.match(re);
  return m ? parseInt(m[1], 10) : null;
}

export function parseVpsSpecs(plan: Plan): VpsSpecs {
  const f = plan.features;
  const cores = f.find((x) => /vCore/i.test(x));
  const ram = f.find((x) => /DDR/i.test(x));
  const storage = f.find((x) => /SSD/i.test(x));
  const uplink = f.find((x) => /uplink/i.test(x)) ?? null;
  const ip = f.find((x) => /IPv4/i.test(x)) ?? null;
  return {
    vCores: firstNumber(cores, /(\d+)\s*vCore/i),
    ramGb: firstNumber(ram, /(\d+)\s*GB/i),
    storageGb: firstNumber(storage, /(\d+)\s*GB/i),
    uplink,
    ip,
  };
}

/** Valores reales que existen en el catálogo, para los deslizadores. */
export const VPS_CORE_STEPS = [1, 2, 4, 6, 8, 12, 14, 16];
export const VPS_RAM_STEPS = [2, 4, 8, 12, 16, 24, 32, 64];
export const VPS_STORAGE_STEPS = [20, 50, 100, 128, 150, 256, 512, 960];

export interface VpsMatch {
  plan: Plan;
  exact: boolean;
  /** true cuando lo pedido supera al plan más grande de la ubicación. */
  exceedsBiggest: boolean;
}

/**
 * Busca el plan de la ubicación que cubre lo pedido. Se prefiere la
 * coincidencia exacta; si no, el siguiente plan que cubre las tres
 * especificaciones. Si ninguno cubre lo pedido, devuelve el plan más
 * grande con exceedsBiggest=true.
 */
export function matchVpsPlan(
  plans: Plan[],
  wantCores: number,
  wantRamGb: number,
  wantStorageGb: number,
): VpsMatch | null {
  const withSpecs = plans
    .map((plan) => ({ plan, specs: parseVpsSpecs(plan) }))
    .filter((x) => x.specs.vCores !== null)
    .sort((a, b) => (a.specs.vCores ?? 0) - (b.specs.vCores ?? 0));
  if (withSpecs.length === 0) return null;

  const exact = withSpecs.find(
    (x) =>
      x.specs.vCores === wantCores &&
      x.specs.ramGb === wantRamGb &&
      x.specs.storageGb === wantStorageGb,
  );
  if (exact) return { plan: exact.plan, exact: true, exceedsBiggest: false };

  const covering = withSpecs.find(
    (x) =>
      (x.specs.vCores ?? 0) >= wantCores &&
      (x.specs.ramGb ?? 0) >= wantRamGb &&
      (x.specs.storageGb ?? 0) >= wantStorageGb,
  );
  if (covering) {
    return { plan: covering.plan, exact: false, exceedsBiggest: false };
  }

  const biggest = withSpecs[withSpecs.length - 1];
  return { plan: biggest.plan, exact: false, exceedsBiggest: true };
}
