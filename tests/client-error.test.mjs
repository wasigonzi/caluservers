import test from "node:test";
import assert from "node:assert/strict";
import { clientSafeError } from "../lib/client-error.ts";

test("un error de validación se explica y un fallo Prisma no filtra el motor", () => {
  const validation = clientSafeError(new Error("Catálogo inválido"));
  assert.equal(validation.status, 400);
  assert.equal(validation.body.error, "Catálogo inválido");

  const missing = clientSafeError(
    Object.assign(new Error("The table public.AdminAudit does not exist"), {
      name: "PrismaClientKnownRequestError",
      code: "P2021",
    }),
  );
  assert.equal(missing.status, 503);
  assert.equal(missing.body.missingMigration, true);
  assert.equal(JSON.stringify(missing.body).includes("AdminAudit"), false);
  assert.equal(JSON.stringify(missing.body).includes("prisma"), false);
});
