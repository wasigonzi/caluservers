import type { MetadataRoute } from "next";

const PATHS = [
  "/",
  "/web-hosting",
  "/vps",
  "/dedicated",
  "/domains",
  "/about",
  "/contact",
  "/client",
  "/terms",
  "/privacy",
  "/aup",
  "/abuse",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://caluservers.com").replace(
    /\/$/,
    "",
  );
  const now = new Date();
  return PATHS.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
