import { expect, test } from "@playwright/test";

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
  const order = page.locator('a.btn.primary[href*="/store/web-hosting/calu-starter"]');
  await expect(order.first()).toBeVisible();
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

test("contacto y dominios explican que continúan en el portal y no salen de la app", async ({ page }) => {
  const external: string[] = [];
  await page.route(/client\.caluservers\.com/, async (route) => {
    external.push(route.request().url());
    await route.abort();
  });
  await page.addInitScript(() => {
    const target = window as unknown as { __opened: string[] };
    target.__opened = [];
    window.open = (url) => {
      target.__opened.push(String(url));
      return null;
    };
  });
  await page.goto("/contact");
  await expect(page.locator("body")).toContainText("no envía");
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-contact.png" });
  await page.locator("#c-name").fill("Auditor");
  await page.locator("#c-email").fill("audit@example.com");
  await page.locator("#c-msg").fill("mensaje local");
  await page.locator("form.formbox").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as { __opened?: string[] }).__opened?.[0] || "",
      ),
    )
    .toContain("submitticket.php");
  expect(external).toEqual([]);

  await page.goto("/domains");
  await expect(page.locator("body")).toContainText("no se consulta");
  await page.locator("form.domain-search input").fill("ejemplo-auditoria.com");
  await page.locator("form.domain-search button").click();
  await expect.poll(() => external.length).toBe(1);
  expect(external[0]).toContain("cart.php?a=add&domain=register");
  expect(external[0]).toContain("ejemplo-auditoria.com");
});
