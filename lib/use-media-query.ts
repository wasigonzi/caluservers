"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Estado de una media query como store externo (`useSyncExternalStore`).
 *
 * Sustituye el patrón «useEffect + setState» que la regla
 * `react-hooks/set-state-in-effect` marca al actualizar a Next 16: el valor se
 * lee directamente del navegador y React se suscribe a sus cambios.
 *
 * En el servidor (sin `window`) devuelve `false`, igual que el estado inicial
 * que usaban los componentes antes.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
