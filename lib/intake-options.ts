import { ABUSE_CATEGORIES } from "./catalog";

/**
 * Opciones compartidas por el formulario y por el validador del servidor.
 * Una sola lista: si el cliente muestra una opción, el servidor la acepta.
 */

export const CONTACT_KINDS = ["contact", "abuse"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONTACT_TOPICS: readonly string[] = [
  "Ventas",
  "Apoyo técnico",
  "Facturación",
];

export const ABUSE_TOPICS: readonly string[] = ABUSE_CATEGORIES;

export function intakeTopics(kind: ContactKind): readonly string[] {
  return kind === "abuse" ? ABUSE_TOPICS : CONTACT_TOPICS;
}
