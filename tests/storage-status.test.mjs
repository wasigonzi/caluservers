import test from "node:test";
import assert from "node:assert/strict";
import { loadOrExplain, storageFailureMessage } from "../lib/storage-status.ts";

test("una tabla ausente no se presenta como lista vacía ni como acceso concedido", async () => {
  const missing = Object.assign(new Error("relation"), { code: "P2021", meta: { modelName: "User" } });
  assert.match(storageFailureMessage(missing), /User/);
  assert.doesNotMatch(storageFailureMessage(missing), /no hay clientes|éxito|contraseña/i);
  const loaded = await loadOrExplain(async () => {
    throw Object.assign(new Error("missing"), { code: "42P01" });
  });
  assert.equal(loaded.ok, false);
  if (!loaded.ok) assert.match(loaded.message, /tabla/);
  const unreachable = await loadOrExplain(async () => {
    throw Object.assign(new Error("down"), { code: "P1001" });
  });
  assert.equal(unreachable.ok, false);
  if (!unreachable.ok) assert.match(unreachable.message, /no respondió/);
});
