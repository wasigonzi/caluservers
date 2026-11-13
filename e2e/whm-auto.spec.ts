import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./fixtures";

// El servidor WHM es un señuelo: la respuesta de /api/admin/whm se simula en el navegador.
test("las cuentas cPanel se leen solas y se refrescan sin pulsar nada", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.locator("form button.btn").click();
  await page.waitForURL("**/admin");
  const saved = await page.request.post("/api/admin/whm/settings", {
    headers: { origin: "http://127.0.0.1:3011" },
    data: { url: "https://whm.example.com:2087", username: "root", token: "A".repeat(32) },
  });
  expect(saved.status()).toBe(200);

  let calls = 0;
  let fail = false;
  await page.route("**/api/admin/whm", async (route) => {
    calls += 1;
    if (fail) return route.fulfill({ status: 502, json: { error: "x" } });
    await route.fulfill({
      json: {
        total: calls,
        truncated: false,
        rows: Array.from({ length: calls }, (_, i) => ({
          user: `cuenta${i + 1}`,
          domain: `sitio${i + 1}.example`,
          plan: "basico",
          suspended: "0",
        })),
      },
    });
  });

  await page.clock.install();
  await page.goto("/admin/accounts");
  // Sin pulsar nada: la primera lectura sale al abrir la página.
  await expect(page.getByRole("cell", { name: "cuenta1", exact: true })).toBeVisible();
  await expect(page.getByText(/Se actualiza sola cada minuto/)).toBeVisible();
  expect(calls).toBe(1);

  await page.clock.runFor(61_000);
  await expect(page.getByRole("cell", { name: "cuenta2", exact: true })).toBeVisible();

  // Tras un fallo no se deja el dato viejo ni se insiste sola.
  fail = true;
  await page.clock.runFor(61_000);
  await expect(page.getByText("No conectado / lectura fallida")).toBeVisible();
  await expect(page.getByRole("cell", { name: "cuenta1", exact: true })).toHaveCount(0);
  const afterFailure = calls;
  await page.clock.runFor(180_000);
  expect(calls).toBe(afterFailure);

  fail = false;
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(page.getByRole("cell", { name: "cuenta1", exact: true })).toBeVisible();
});
