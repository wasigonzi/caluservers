import test from "node:test";
import assert from "node:assert/strict";
import { isOrderablePlan } from "../lib/orderable.ts";

test("la contratación interna /cuenta/contratar?plan=<id> es pedible", () => {
  assert.equal(
    isOrderablePlan({ price: "$3.99", purchaseUrl: "/cuenta/contratar?plan=wh0" }),
    true,
  );
  assert.equal(
    isOrderablePlan({
      price: "$6.99",
      purchaseUrl: "/cuenta/contratar?plan=plan-1793754336742",
    }),
    true,
  );
  // Sin plan no hay contratación: ni interna sin parámetro ni carrito genérico.
  assert.equal(
    isOrderablePlan({ price: "$3.99", purchaseUrl: "/cuenta/contratar" }),
    false,
  );
  assert.equal(
    isOrderablePlan({ price: "$3.99", purchaseUrl: "/cuenta/contratar?plan=" }),
    false,
  );
  // Precio a confirmar no se ordena aunque la URL sea interna.
  assert.equal(
    isOrderablePlan({ price: "$0.00", purchaseUrl: "/cuenta/contratar?plan=plan-1793755011801" }),
    false,
  );
});

test("producto concreto de la tienda anterior sigue siendo pedible (transición)", () => {
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
