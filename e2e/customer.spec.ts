import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { readdir, readFile, rm } from "node:fs/promises";
import { E2E_EMAIL, E2E_PASSWORD } from "./fixtures";

const sink = "/tmp/calu-mail-e2e";

async function latestLink() {
  const files = (await readdir(sink)).filter((name) => name.endsWith(".txt")).sort();
  const text = await readFile(`${sink}/${files.at(-1)}`, "utf8");
  const link = text.split("\n").find((line) => line.startsWith("http"));
  if (!link) throw new Error("missing verification link");
  return link;
}

test("registro, pedido, pago manual y ticket", async ({ page }) => {
  await rm(sink, { recursive: true, force: true });
  const email = `cliente-${Date.now()}@example.com`;
  const password = `Pw-${randomBytes(9).toString("hex")}`;
  await page.goto("/cuenta/registro");
  await page.getByLabel("Nombre").fill("Cliente Prueba");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Cuenta creada")).toBeVisible();
  const verify = await latestLink();
  expect(verify).not.toContain(email + password);
  await page.goto(verify);
  await page.goto("/cuenta/entrar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.goto("/cuenta/contratar?plan=wh0");
  await page.getByRole("button", { name: "Crear pedido" }).click();
  await expect(page.getByText("399")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-order.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Contratar" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.locator("form button.btn").click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/comercio");
  await page.getByLabel("Nota del cobro manual").fill("transferencia revisada en el panel");
  await page.getByRole("button", { name: "Confirmar pago manual" }).click();
  await expect(page.getByText("pending_provision")).toBeVisible();
  await page.getByLabel("Nota de alta manual").fill("alta manual sin llamar a WHM");
  await page.getByRole("button", { name: "Marcar alta manual" }).click();
  await expect(page.getByText("active")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-admin-commerce.png" });
  await page.context().clearCookies();
  await page.goto("/cuenta/entrar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.goto("/cuenta/tickets");
  await page.getByLabel("Asunto").fill("Duda de alta");
  await page.getByLabel("Mensaje").fill("¿Cuándo queda activo?");
  await page.getByRole("button", { name: "Abrir ticket" }).click();
  await expect(page.getByText("abierto")).toBeVisible();
});
