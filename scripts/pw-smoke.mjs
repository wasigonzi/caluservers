import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:3010";
const pages = [
  "/",
  "/web-hosting",
  "/vps",
  "/dedicated",
  "/domains",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/aup",
  "/abuse",
  "/client",
  "/admin/login",
  "/admin/site", // should redirect to login
];

const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "es-ES",
  });
  const page = await context.newPage();
  for (const path of pages) {
    const url = BASE + path;
    let status = "ok";
    let detail = "";
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const code = resp?.status() ?? 0;
      const title = await page.title();
      const hasTabbar =
        vp.width <= 900
          ? (await page.locator(".mobile-tabbar").count()) > 0 &&
            (await page.locator(".mobile-tabbar").isVisible())
          : true;
      const lang = await page.locator("html").getAttribute("lang");
      // admin site redirects
      const finalUrl = page.url();
      if (code >= 400) status = "fail";
      detail = `status=${code} title=${JSON.stringify(title)} lang=${lang} final=${finalUrl.replace(BASE, "")} tabbarVisible=${vp.width <= 900 ? hasTabbar : "n/a"}`;
      if (path.startsWith("/admin") && path !== "/admin/login") {
        if (!finalUrl.includes("/admin/login")) {
          status = "warn";
          detail += " (expected login redirect)";
        }
      }
      if (!path.startsWith("/admin") && lang !== "es") {
        status = "fail";
        detail += " BAD_LANG";
      }
      if (vp.width <= 900 && !path.startsWith("/admin") && !hasTabbar) {
        status = "fail";
        detail += " NO_TABBAR";
      }
    } catch (e) {
      status = "fail";
      detail = String(e);
    }
    results.push({ vp: vp.name, path, status, detail });
    console.log(`[${status}] ${vp.name} ${path} :: ${detail}`);
  }
  await context.close();
}

await browser.close();
const failed = results.filter((r) => r.status === "fail");
console.log("\nSUMMARY", { total: results.length, failed: failed.length });
if (failed.length) process.exit(1);
