import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * Configuración plana (flat config) de ESLint 9.
 *
 * Next 16 elimina `next lint` y `eslint-config-next@16` ya exporta un array
 * plano, así que no hace falta FlatCompat. El alcance del script `lint` se
 * mantiene igual que antes (`app`, `components`, `lib`), que es lo que linteaba
 * `next lint`.
 */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  {
    // Igual que la configuración anterior: las ilustraciones del sitio se
    // sirven con <img> a propósito.
    files: ["components/**/*.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];
