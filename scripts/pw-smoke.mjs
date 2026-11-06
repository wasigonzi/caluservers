import { chromium } from "@playwright/test";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3010";
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
  "/robots.txt",
  "/sitemap.xml",
  "/admin/login",
  "/admin/site",
];

const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-900", width: 900, height: 900 },
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
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  for (const path of pages) {
    const url = BASE + path;
    let status = "ok";
    let detail = "";
    try {
      const resp = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      const code = resp?.status() ?? 0;
      const title = await page.title();
      const lang = await page.locator("html").getAttribute("lang");
      const finalUrl = page.url();
      const expectTabbar = vp.width <= 800;
      const hasTabbar =
        expectTabbar && !path.startsWith("/admin") && !path.endsWith(".txt") && !path.endsWith(".xml")
          ? (await page.locator(".mobile-tabbar").count()) > 0 &&
            (await page.locator(".mobile-tabbar").isVisible())
          : true;
      if (code >= 400) status = "fail";
      detail = `status=${code} title=${JSON.stringify(title)} lang=${lang} final=${finalUrl.replace(BASE, "")} tabbar=${expectTabbar ? hasTabbar : "n/a"}`;
      if (path.startsWith("/admin") && path !== "/admin/login" && !path.includes(".")) {
        if (!finalUrl.includes("/admin/login")) {
          status = "warn";
          detail += " (expected login redirect)";
        }
      }
      if (
        !path.startsWith("/admin") &&
        !path.includes(".") &&
        lang !== "es"
      ) {
        status = "fail";
        detail += " BAD_LANG";
      }
      if (
        expectTabbar &&
        !path.startsWith("/admin") &&
        !path.includes(".") &&
        !hasTabbar
      ) {
        status = "fail";
        detail += " NO_TABBAR";
      }
      if (consoleErrors.length) {
        status = "fail";
        detail += ` PAGEERROR=${consoleErrors.slice(-1)[0]}`;
        consoleErrors.length = 0;
      }
      // CTAs / purchase on product pages
      if (path === "/web-hosting" || path === "/vps" || path === "/dedicated") {
        const orders = page.locator('a.btn.primary[href*="client.caluservers.com"]');
        const n = await orders.count();
        detail += ` purchaseLinks=${n}`;
        if (n < 1) {
          status = "fail";
          detail += " NO_PURCHASE_CTA";
        }
      }
      if (path === "/") {
        const heroBtn = page.locator(".hero-ctas a.btn, .hero-ctas .btn");
        if ((await heroBtn.count()) < 1) {
          status = "fail";
          detail += " NO_HERO_CTA";
        }
        // Exactly one brand logo visible (CSS swap desktop/mobile)
        const desk = page.locator(".brand .logo-desktop");
        const mob = page.locator(".brand .logo-mobile");
        const deskVis = (await desk.count()) > 0 && (await desk.isVisible());
        const mobVis = (await mob.count()) > 0 && (await mob.isVisible());
        const visibleCount = (deskVis ? 1 : 0) + (mobVis ? 1 : 0);
        detail += ` logosVisible=${visibleCount} desk=${deskVis} mob=${mobVis}`;
        if (visibleCount !== 1) {
          status = "fail";
          detail += " DOUBLE_OR_MISSING_LOGO";
        }
        const expectMobile = vp.width <= 900;
        if (expectMobile && !mobVis) {
          status = "fail";
          detail += " EXPECT_MOBILE_LOGO";
        }
        if (!expectMobile && !deskVis) {
          status = "fail";
          detail += " EXPECT_DESKTOP_LOGO";
        }
        // Fallback: mobile src equals desktop when logoMobileUrl empty (defaults)
        const deskSrc = await desk.getAttribute("src");
        const mobSrc = await mob.getAttribute("src");
        detail += ` deskSrc=${deskSrc} mobSrc=${mobSrc}`;
        if (!deskSrc || !mobSrc) {
          status = "fail";
          detail += " MISSING_LOGO_SRC";
        }
        // Custom mobile: inject distinct src and re-check visibility + src used
        await mob.evaluate((el) => {
          el.setAttribute("data-prev-src", el.getAttribute("src") || "");
          el.setAttribute("src", "/assets/monograma-cs.svg");
        });
        const customSrc = await mob.getAttribute("src");
        const stillOne =
          ((await desk.isVisible()) ? 1 : 0) + ((await mob.isVisible()) ? 1 : 0);
        detail += ` customMobSrc=${customSrc} customVisible=${stillOne}`;
        if (stillOne !== 1) {
          status = "fail";
          detail += " CUSTOM_MOBILE_DOUBLE_LOGO";
        }
        if (expectMobile && customSrc !== "/assets/monograma-cs.svg") {
          status = "fail";
          detail += " CUSTOM_MOBILE_SRC_LOST";
        }
        // restore
        await mob.evaluate((el) => {
          const prev = el.getAttribute("data-prev-src");
          if (prev) el.setAttribute("src", prev);
        });
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
