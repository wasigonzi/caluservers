import "server-only";
import { db } from "@/lib/db";
import type { ControlPanel } from "@/lib/plugin-types";
import { decryptWhm } from "@/lib/whm";
import {
  decryptProvisionCredentials,
  provisionConfiguration,
  suspendWhmAccount,
  terminateWhmAccount,
  unsuspendWhmAccount,
} from "@/lib/whm-provision";
import { WhmError } from "@/lib/whm-security";
import { readWhm, type WhmCredentials } from "@/lib/whm-transport";
import { writeWhm } from "@/lib/whm-write";

/**
 * Adaptador WHM del contrato `ControlPanel` (Fase 4, frente A).
 *
 * No reescribe nada: adapta las funciones que ya existen en
 * `lib/whm-provision.ts` (suspender/reactivar/terminar por usuario) y el
 * transporte de escritura (`createacct` directo con los datos dados).
 *
 * - `createAccount` usa las credenciales de ESCRITURA (token con ACL
 *   `createacct`); la contraseña llega ya generada por quien llama.
 * - `suspendAccount` / `unsuspendAccount` / `terminateAccount` lanzan con
 *   el motivo si WHM no lo hace: el contrato `ControlPanel` no tiene tipo
 *   de resultado, así que el fallo se comunica con la excepción. El motivo
 *   es el mismo que dejan `suspendServiceAccount` y compañía en
 *   `provisionError` (incluido el aviso de la ACL cuando WHM rechaza).
 * - `changePackage` NO está implementado: `changepackage` no está en la
 *   lista de comandos de escritura permitidos (`lib/whm-write.ts`) y no se
 *   inventa la llamada. Lanza `not-supported` honesto.
 * - `listAccounts` / `listPackages` usan la lectura WHM (token de solo
 *   lectura, ACL `listaccts` / `listpkgs`).
 */

async function writeCredentials(): Promise<{
  endpoint: string;
  credentials: WhmCredentials;
}> {
  const config = await provisionConfiguration();
  if (!config.enabled || !config.hasToken || !config.url) {
    throw new Error(
      "El alta automática en WHM no está configurada: falta activación, servidor o token de escritura.",
    );
  }
  // Mismo id que CONFIG_ID en lib/whm-provision.ts ("whm-provision").
  const row = await db.integrationConfig.findUnique({ where: { id: "whm-provision" } });
  if (!row) throw new Error("Sin configuración de escritura WHM.");
  return { endpoint: row.endpoint, credentials: decryptProvisionCredentials(row.encryptedCredentials) };
}

async function readCredentials(): Promise<{
  endpoint: string;
  credentials: WhmCredentials;
}> {
  const row = await db.integrationConfig.findUnique({ where: { id: "whm" } });
  if (!row) throw new Error("Sin credenciales de lectura WHM: configura WHM en el panel.");
  return { endpoint: row.endpoint, credentials: decryptWhm(row.encryptedCredentials) };
}

function whmFailure(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("WHM no completó la operación.");
}

export const whmPanel: ControlPanel = {
  key: "whm",

  async createAccount(input) {
    const { endpoint, credentials } = await writeCredentials();
    try {
      const result = await writeWhm(endpoint, credentials, "createacct", {
        username: input.username,
        domain: input.domain,
        plan: input.plan,
        password: input.password,
        contactemail: input.email,
        useregns: "0",
        reseller: "0",
      });
      return { username: result.user || input.username, domain: input.domain };
    } catch (error) {
      if (error instanceof WhmError && error.code === "rejected") {
        throw new Error(
          "WHM rechazó el alta: revisa que el token de escritura tenga la ACL createacct.",
        );
      }
      throw whmFailure(error);
    }
  },

  async suspendAccount(input) {
    const result = await suspendWhmAccount({ username: input.username, actor: "whm-panel" });
    if (!result.suspended) throw new Error(result.reason);
  },

  async unsuspendAccount(input) {
    const result = await unsuspendWhmAccount({ username: input.username, actor: "whm-panel" });
    if (!result.unsuspended) throw new Error(result.reason);
  },

  async terminateAccount(input) {
    const result = await terminateWhmAccount({ username: input.username, actor: "whm-panel" });
    if (!result.terminated) throw new Error(result.reason);
  },

  async changePackage(_input) {
    throw new Error(
      "not-supported: cambiar el paquete en WHM (changepackage) no está en la lista de comandos de escritura permitidos (lib/whm-write.ts).",
    );
  },

  async listAccounts() {
    const { endpoint, credentials } = await readCredentials();
    const { rows } = await readWhm(endpoint, credentials, "listaccts");
    return rows.map((row) => ({
      username: row.user ?? "",
      domain: row.domain ?? "",
      suspended: row.suspended === "1",
    }));
  },

  async listPackages() {
    const { endpoint, credentials } = await readCredentials();
    const { rows } = await readWhm(endpoint, credentials, "listpkgs");
    return rows.map((row) => ({ name: row.name ?? "" }));
  },
};
