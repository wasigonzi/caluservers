// Cargador de módulos TypeScript para pruebas: transpila y ejecuta en un contexto
// aislado con mocks explícitos. Mismo enfoque que tests/whm.test.mjs, extraído para
// que las pruebas nuevas no repitan el andamiaje.
//
// Todos los tokens, credenciales y hosts de las pruebas son señuelos locales.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DEFAULT_ENV = {
  NODE_ENV: "production",
  AUTH_SECRET: "a".repeat(64),
  SETTINGS_ENCRYPTION_KEY: "ab".repeat(32),
};

/**
 * Devuelve `load(ruta)` para cargar un módulo del repo.
 * `mocks` admite ids exactos ("node:https", "@/lib/db"), más `env`.
 */
export function loader(mocks = {}) {
  const cache = new Map();
  function load(name) {
    const file = resolve(root, name);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    function localRequire(id) {
      if (id in mocks) return mocks[id];
      if (id === "server-only") return {};
      if (id === "node:dns/promises") {
        return {
          lookup: async () => {
            throw new Error("DNS inesperado en la prueba");
          },
        };
      }
      if (id === "node:https") {
        return {
          request: () => {
            throw new Error("Red inesperada en la prueba");
          },
        };
      }
      if (id.startsWith("@/") || id.startsWith(".")) {
        let path = id.startsWith("@/")
          ? resolve(root, id.slice(2))
          : resolve(dirname(file), id);
        if (!existsSync(path)) path += existsSync(path + ".ts") ? ".ts" : ".tsx";
        return load(path);
      }
      return require(id);
    }
    runInNewContext(
      code,
      {
        module,
        exports: module.exports,
        require: localRequire,
        URL,
        URLSearchParams,
        Buffer,
        Request,
        Response,
        Headers,
        TextEncoder,
        TextDecoder,
        structuredClone,
        setTimeout: mocks.setTimeout ?? setTimeout,
        clearTimeout: mocks.clearTimeout ?? clearTimeout,
        process: { env: { ...DEFAULT_ENV, ...mocks.env } },
        console,
      },
      { filename: file },
    );
    return module.exports;
  }
  return { load };
}

/** Cabeceras simples con la interfaz `get` que usan las rutas. */
export function headers(map = {}) {
  const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => lower.get(String(name).toLowerCase()) ?? null };
}
