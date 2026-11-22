/**
 * Los tests de integración importan código de servidor real (lib/commerce.ts,
 * lib/writes.ts), que arrastra `import "server-only"`. Ese paquete resuelve a
 * un `throw` salvo que exista la condición de resolución `react-server`, y esa
 * condición no se puede activar para todo el proceso: también cambia cómo se
 * resuelve `react` y rompe los tests que lo importan.
 *
 * Este gancho resuelve SOLO `server-only` a un módulo vacío. No toca ningún
 * otro especificador, así que React y el resto se resuelven igual que en la
 * aplicación. Se activa únicamente desde el script `test` (ver package.json).
 *
 * Se usa `module.registerHooks` (síncrono, Node 22.15+) porque se aplica
 * también a los módulos que carga tsx; el `module.register` de un cargador
 * aparte quedaba fuera de esa cadena.
 */
import { registerHooks } from "node:module";

const EMPTY_MODULE = new URL("./empty-module.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: EMPTY_MODULE, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
