import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { readdir, readFile, rm } from "node:fs/promises";
import { E2E_EMAIL, E2E_PASSWORD } from "./fixtures";

const sink = "/tmp/calu-mail-e2e";

async function latestLink() {
  // Solo los correos de autenticación: los avisos de contacto comparten el sumidero.
  const files = (await readdir(sink))
    .filter((name) => name.endsWith("-verify.txt") || name.endsWith("-reset.txt"))
    .sort();
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
  // La primera llamada compila la ruta de autenticación en frío: puede tardar más de 5 s.
  await expect(page.getByText("Cuenta creada")).toBeVisible({ timeout: 30_000 });
  const verify = await latestLink();
  expect(verify).not.toContain(email + password);
  await page.goto(verify);
  await page.goto("/cuenta/entrar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.goto("/cuenta/contratar?plan=wh0");
  // Un plan de hosting exige el dominio con el que se creará la cuenta cPanel.
  await page.getByRole("button", { name: "Crear pedido" }).click();
  await expect(page.locator('input[required]:invalid')).toHaveCount(1);
  await page.getByLabel("Dominio para este plan").fill("cliente-prueba.example");
  await page.getByRole("button", { name: "Crear pedido" }).click();
  await expect(page.getByText("Total 3.99 USD")).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/e2e-order.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Contratar" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.locator("form button.btn").click();
  await page.waitForURL("**/admin");
  await expect(page.getByRole("link", { name: /1\s*factura por cobrar/ })).toBeVisible();
  // El admin define cómo pagar a mano; el cliente lo ve en su factura pendiente.
  const instructions = await page.request.post("/api/admin/system", {
    headers: { origin: "http://127.0.0.1:3011" },
    data: { action: "save-payment-instructions", text: "ATH Móvil de prueba al 787-555-0100" },
  });
  expect(instructions.status()).toBe(200);
  await page.goto("/cuenta");
  await expect(page.getByRole("heading", { level: 1, name: "Hola, Cliente" })).toBeVisible();
  await page.getByRole("link", { name: /Pagar la factura PF-/ }).click();
  await expect(page.getByText("ATH Móvil de prueba al 787-555-0100")).toBeVisible();
  await expect(page.locator(".invoice-doc .badge", { hasText: "Por pagar" })).toBeVisible();
  await page.goto("/admin/facturas");
  await page.getByRole("button", { name: "Confirmar pago" }).click();
  await page.getByLabel("Nota del cobro").fill("transferencia revisada en el panel");
  await page.getByRole("button", { name: "Confirmar pago manual" }).click();
  await expect(page.getByText("No hay facturas en este estado.")).toBeVisible();
  await page.goto("/admin/servicios");
  await expect(page.locator("td .badge", { hasText: "Pendiente de alta" })).toBeVisible();
  // El alta automática está desactivada: no debe aparecer el botón que llama a WHM.
  await expect(page.getByRole("button", { name: "Dar de alta en WHM ahora" })).toHaveCount(0);
  await page.getByRole("button", { name: "Marcar alta manual" }).click();
  await page.getByLabel("Nota de alta manual").fill("alta manual sin llamar a WHM");
  await page.getByRole("button", { name: "Marcar como activo" }).click();
  await expect(page.locator("td .badge", { hasText: "Activo" })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/e2e-admin-commerce.png" });
  await page.goto("/admin/clientes");
  await page.getByRole("link", { name: "Cliente Prueba" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cliente Prueba" })).toBeVisible();
  await expect(page.getByText("cliente-prueba.example").first()).toBeVisible();
  await page.goto("/admin/actividad");
  await expect(page.getByText("Pago confirmado")).toBeVisible();
  await page.context().clearCookies();
  await page.goto("/cuenta/entrar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByText("Todo al día")).toBeVisible();
  await page.getByRole("navigation", { name: "Mi cuenta" }).getByRole("link", { name: "Mis servicios" }).click();
  await expect(page.getByText("cliente-prueba.example")).toBeVisible();
  await expect(page.locator(".service-tile .badge", { hasText: "Activo" })).toBeVisible();
  await page.getByRole("navigation", { name: "Mi cuenta" }).getByRole("link", { name: "Facturas" }).click();
  await page.locator("td a.row-link").first().click();
  await expect(page.getByText(/Pagada el/)).toBeVisible();
  // Una factura pagada ya no enseña cómo pagar.
  await expect(page.getByText("ATH Móvil de prueba")).toHaveCount(0);
  // Perfil: el nombre se puede cambiar.
  await page.goto("/cuenta/perfil");
  await page.getByLabel("Nombre").fill("Cliente Renombrado");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByText("Nombre guardado.")).toBeVisible();
  await page.goto("/cuenta/tickets");
  await page.getByLabel("Asunto").fill("Duda de alta");
  await page.getByLabel("Mensaje").fill("¿Cuándo queda activo?");
  await page.getByRole("button", { name: "Abrir ticket" }).click();
  await expect(page.getByText("Ticket abierto")).toBeVisible();

  // El admin responde y cierra; el cliente lee la respuesta en su hilo.
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.locator("form button.btn").click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/tickets");
  await page.getByRole("link", { name: "Duda de alta" }).click();
  await expect(page.getByText("¿Cuándo queda activo?")).toBeVisible();
  await page.getByLabel("Respuesta").fill("Ya está activo desde hoy.");
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(page.locator(".thread-admin")).toContainText("Ya está activo desde hoy.");
  await page.goto("/cuenta/tickets");
  await page.getByRole("link", { name: "Duda de alta" }).click();
  await expect(page.getByText("Ya está activo desde hoy.")).toBeVisible();
  await page.getByLabel("Tu respuesta").fill("Gracias, confirmado.");
  await page.getByRole("button", { name: "Enviar respuesta" }).click();
  await expect(page.getByText("Gracias, confirmado.")).toBeVisible();
  await page.goto("/admin/tickets");
  await page.getByRole("link", { name: "Duda de alta" }).click();
  await page.getByRole("button", { name: "Cerrar ticket" }).click();
  await expect(page.getByRole("button", { name: "Reabrir ticket" })).toBeVisible();
  await page.goto("/cuenta/tickets");
  await page.getByRole("link", { name: "Duda de alta" }).click();
  await expect(page.getByText("Este ticket está cerrado")).toBeVisible();
});
