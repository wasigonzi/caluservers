import test from "node:test";
import assert from "node:assert/strict";
import { isOrderablePlan } from "../lib/orderable.ts";

test("producto concreto de la tienda es pedible", () => {
  assert.equal(
    isOrderablePlan({
      price: "$3.99",
      purchaseUrl:
        "https://client.caluservers.com/index.php?rp=/store/web-hosting/calu-starter",
    }),
    true,
  );
});

test("carrito genérico, precio vacío o grupo sin producto no se ordenan", () => {
  assert.equal(
    isOrderablePlan({
      price: "$79.99",
      purchaseUrl: "https://client.caluservers.com/cart.php",
    }),
    false,
  );
  assert.equal(
    isOrderablePlan({
      price: "",
      purchaseUrl:
        "https://client.caluservers.com/index.php?rp=/store/web-hosting/calu-starter",
    }),
    false,
  );
  assert.equal(
    isOrderablePlan({
      price: "$3.99",
      purchaseUrl: "https://client.caluservers.com/index.php?rp=/store/web-hosting",
    }),
    false,
  );
  assert.equal(isOrderablePlan({ price: "$0.00", purchaseUrl: "" }), false);
});
