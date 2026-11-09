import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./fixtures";

test("cabeceras, login, logout, almacenamiento y guardado de CMS", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const home = await page.goto("/");
  const csp = home?.headers()["content-security-policy"] || "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(home?.headers()["x-content-type-options"]).toBe("nosniff");

  await page.goto("/admin/login");
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill("wrong-password-value");
  await page.locator("form button.btn").click();
  await expect(page.locator(".error")).toContainText("Credenciales");

  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.locator("form button.btn").click();
  await page.waitForURL("**/admin");
  await expect(page.getByRole("heading", { name: "Tu sitio. Tu marca." })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-admin.png" });

  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Conexión WHM / cPanel" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Pendiente configuración");
  await expect(page.locator("body")).not.toContainText("Almacenamiento no disponible");

  const blob = await page.request.get("/api/admin/branding-upload");
  expect(blob.status()).toBe(200);
  const blobBody = await blob.json();
  expect(blobBody.configured).toBe(false);

  const whm = await page.request.get("/api/admin/whm/settings");
  expect(whm.status()).toBe(200);
  const whmBody = await whm.json();
  expect(whmBody.state).toBe("pending");
  expect(whmBody.hasToken).toBe(false);

  const legacy = await page.request.get("/api/admin/whmcs");
  expect(legacy.status()).toBe(410);

  const saved = await page.request.post("/api/admin/page-content", {
    headers: { origin: "http://127.0.0.1:3011" },
    data: { path: "/contact", payload: { title: "Contacto de prueba" } },
  });
  expect(saved.status()).toBe(200);
  const publicContent = await page.request.get("/api/page-content?path=/contact");
  const payload = await publicContent.json();
  expect(payload.payload.title).toBe("Contacto de prueba");

  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  const closed = await page.request.get("/api/admin/catalog");
  expect(closed.status()).toBe(401);
});
