// La verificación de correo se eliminó (rama feat/remove-email-verification):
// el registro ya no exige verificar nada y la acción `verify-email` del admin
// dejó de existir. Las pruebas del comportamiento nuevo viven en
// tests/no-email-verification.test.mjs. Este archivo queda solo para que el
// árbol no conserve la suite vieja.
import test from "node:test";
import assert from "node:assert/strict";

test("verify-email fue eliminado; ver tests/no-email-verification.test.mjs", () => {
  assert.ok(true);
});
