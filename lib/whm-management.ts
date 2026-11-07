import "server-only";
import { db } from "@/lib/db";
import { decryptWhm } from "@/lib/whm";
import { readWhm, writeWhm } from "@/lib/whm-transport";
import { parseWhmManagement } from "@/lib/whm-management-schema";
import { WhmError, safeWhmError } from "@/lib/whm-security";
export async function manageWhm(input: unknown) {
  const parsed = parseWhmManagement(input); // Before storage/decryption/network.
  const stored = await db.integrationConfig.findUnique({
    where: { id: "whm" },
  });
  if (!stored) throw new WhmError("pending");
  const credentials = decryptWhm(stored.encryptedCredentials);
  if (!credentials.token) throw new WhmError("pending");
  if (parsed.target.includes(credentials.token)) throw new WhmError("invalid");
  // Current auth has one configured admin identity. Never persist email, host, body, reason or credentials.
  const details = (outcome: string) =>
    JSON.stringify({
      actor: "configured-admin",
      action: parsed.action,
      outcome,
      target: parsed.target,
    });
  const audit = await db.adminAudit.create({
    data: {
      action: `whm.${parsed.action}`,
      entityId: parsed.target,
      details: details("started"),
    },
  });
  try {
    // Re-read actual accessible resources/state; never trust rows or package choices from the browser.
    if (
      ["suspendacct", "unsuspendacct", "changepackage", "createacct"].includes(
        parsed.action,
      )
    ) {
      const accounts = await readWhm(stored.endpoint, credentials, "listaccts");
      const account = accounts.rows.find((row) => row.user === parsed.target);
      if (parsed.action === "createacct" ? Boolean(account) : !account)
        throw new WhmError("conflict");
      if (
        (parsed.action === "suspendacct" && account?.suspended !== "0") ||
        (parsed.action === "unsuspendacct" && account?.suspended !== "1")
      )
        throw new WhmError("conflict");
    }
    if (
      ["createacct", "changepackage", "addpkg", "editpkg"].includes(
        parsed.action,
      )
    ) {
      const packages = await readWhm(stored.endpoint, credentials, "listpkgs");
      const target = parsed.params.plan || parsed.params.pkg || parsed.target;
      const exists = packages.rows.some((row) => row.name === target);
      if (parsed.action === "addpkg" ? exists : !exists)
        throw new WhmError("conflict");
    }
    await writeWhm(stored.endpoint, credentials, input);
  } catch (error) {
    const failure =
      error instanceof WhmError ? error : new WhmError("uncertain");
    const safe = safeWhmError(failure);
    try {
      await db.adminAudit.update({
        where: { id: audit.id },
        data: {
          details: details(
            safe.code === "uncertain" ? "uncertain" : "not-confirmed",
          ),
        },
      });
    } catch {
      /* Initial audit remains. Never replace original outcome or log raw errors. */
    }
    throw failure;
  }
  let auditRecorded = true;
  try {
    await db.adminAudit.update({
      where: { id: audit.id },
      data: { details: details("confirmed") },
    });
  } catch {
    auditRecorded = false;
  }
  return {
    ok: true,
    action: parsed.action,
    target: parsed.target,
    auditRecorded,
  };
}
