import type { Metadata } from "next";
import "./styles.css";
import "./site-premium.css";

export const metadata: Metadata = {
  title: {
    default: "CaluServers | Web Hosting • VPS • Dedicated",
    template: "%s | CaluServers",
  },
  description:
    "Hosting web, VPS y servidores dedicados con infraestructura premium. Portal de clientes en WHMCS.",
  alternates: { languages: { es: "/", "x-default": "/" } },
  openGraph: {
    locale: "es_ES",
    type: "website",
    siteName: "CaluServers",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="alternate" hrefLang="es" href="/" />
        <link rel="alternate" hrefLang="x-default" href="/" />
      </head>
      <body>{children}</body>
    </html>
  );
}
