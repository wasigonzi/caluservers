import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./fixtures";

const pages = ["/", "/web-hosting", "/vps", "/dedicated", "/domains", "/about", "/contact", "/client", "/abuse", "/terms", "/privacy", "/aup"];

test("páginas públicas en escritorio y móvil", async ({ page }) => {
  for (const path of pages) {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".mobile-tabbar")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-mobile.png" });
  await expect(page.locator(".brand .logo-mobile")).toBeVisible();
  await expect(page.locator(".brand .logo-desktop")).toBeHidden();
});

test("el aviso de red no se presenta como monitorización", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".topbar")).toContainText("Aviso manual, no es monitorización");
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-home.png" });
});

test("hosting confirmado enlaza al producto y dedicados no piden pedido", async ({ page }) => {
  await page.goto("/web-hosting");
  await expect(page.getByText("Calu Corporate").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Contratar aquí" }).first()).toBeVisible();
  await expect(page.locator('a[href*="/store/web-hosting/calu-starter"]').first()).toBeVisible();
  await page.goto("/dedicated");
  await expect(page.getByText("La tienda pública no lista servidores dedicados")).toBeVisible();
  await expect(page.locator('a[href*="cart.php"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Consultar disponibilidad" }).first()).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-dedicated.png" });
});

test("VPS New York Normal muestra el precio público, no cero", async ({ page }) => {
  await page.goto("/vps");
  await expect(page.locator("body")).toContainText("$12.99");
  await expect(page.locator("body")).not.toContainText("$0.00");
});

test("el formulario de contacto envía de verdad y queda registrado", async ({ page }) => {
  const external: string[] = [];
  await page.route(/client\.caluservers\.com/, async (route) => {
    external.push(route.request().url());
    await route.abort();
  });
  await page.goto("/contact");
  // La página ya no dice que no envía: el buzón es propio.
  await expect(page.locator("body")).not.toContainText("no envía");
  await page.locator('input[name="name"]').fill("Auditor");
  await page.locator('input[name="email"]').fill("audit@example.com");
  await page.locator('textarea[name="body"]').fill("Mensaje de auditoría del formulario propio.");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByText("Mensaje recibido")).toBeVisible();
  // Nada salió al portal externo.
  expect(external).toEqual([]);
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-contact.png" });

  // El panel lo muestra en la bandeja.
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.locator("form button.btn").click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/mensajes");
  await expect(page.getByText("audit@example.com")).toBeVisible();
  await expect(page.getByText("Mensaje de auditoría del formulario propio.")).toBeVisible();
  await page.context().clearCookies();
});

test("el reporte de abuso exige dominio o IP y se envía", async ({ page }) => {
  await page.goto("/abuse");
  await page.locator('input[name="name"]').fill("Auditor");
  await page.locator('input[name="email"]').fill("audit@example.com");
  await page.locator('input[name="target"]').fill("malo.example.com");
  await page
    .locator('textarea[name="body"]')
    .fill("Esta cuenta aloja una página falsa, aquí la evidencia.");
  await page.getByRole("button", { name: "Enviar reporte" }).click();
  await expect(page.getByText("Mensaje recibido")).toBeVisible();
});

test("la búsqueda de dominios muestra disponibilidad real y nunca inventa un «libre»", async ({
  page,
}) => {
  const external: string[] = [];
  await page.route(/client\.caluservers\.com/, async (route) => {
    external.push(route.request().url());
    await route.abort();
  });
  // La respuesta del registro se simula: la prueba mide la interfaz, no la red ajena.
  let reply: Record<string, unknown> = {};
  await page.route("**/api/domains**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply) });
  });

  await page.goto("/domains");
  await expect(page.locator("body")).not.toContainText("no se consulta");

  reply = { ok: true, domain: "libre-auditoria.com", tld: ".com", state: "available" };
  await page.locator("form.domain-search input").fill("libre-auditoria.com");
  await page.locator("form.domain-search button").click();
  await expect(page.getByText("libre-auditoria.com está libre")).toBeVisible();
  const register = page.getByRole("link", { name: /Registrarlo en el portal/ });
  await expect(register).toHaveAttribute("href", /cart\.php\?a=add&domain=register/);
  await expect(register).toHaveAttribute("href", /libre-auditoria\.com/);

  reply = { ok: true, domain: "ocupada-auditoria.com", tld: ".com", state: "registered" };
  await page.locator("form.domain-search input").fill("ocupada-auditoria.com");
  await page.locator("form.domain-search button").click();
  await expect(page.getByText("ocupada-auditoria.com ya está registrado")).toBeVisible();

  reply = {
    ok: true,
    domain: "sinrespuesta-auditoria.com",
    tld: ".com",
    state: "unverified",
    reason: "unreachable",
  };
  await page.locator("form.domain-search input").fill("sinrespuesta-auditoria.com");
  await page.locator("form.domain-search button").click();
  // La afirmación se mide en la región del resultado, no en toda la página: el texto
  // de marketing de /domains contiene «si está libre» de forma permanente, así que
  // buscarlo en el `body` daría un falso fallo aunque el resultado fuese correcto.
  const result = page.locator("#domain-result");
  await expect(result.getByText("No pudimos confirmar")).toBeVisible();
  await expect(result.getByText("está libre")).toHaveCount(0);

  // Buscar no navega al portal por su cuenta.
  expect(external).toEqual([]);
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-domains.png" });
});
