const isDev = process.env.NODE_ENV !== "production";

// CSP que se aplica: Next.js (App Router) inyecta scripts en línea para el
// payload RSC, así que script-src/style-src necesitan 'unsafe-inline' mientras
// no haya nonces (ver REPORT-ONLY más abajo). 'unsafe-eval' solo existe en dev.
// Si algún día se añaden nonces de Next, quitar 'unsafe-inline' de aquí y
// promover la CSP estricta de informe a aplicada.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "frame-src https://my.spline.design",
  "connect-src 'self' https://*.blob.vercel-storage.com https://vercel.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// CSP estricta solo de informe: lo que se aplicaría sin 'unsafe-inline'.
// Las violaciones aparecen en la consola del navegador sin romper el panel;
// es el canario para una futura migración a nonces. NO promoverla a aplicada
// sin nonces: rompería los scripts en línea que Next.js necesita.
const strictCspReportOnly = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "frame-src https://my.spline.design",
  "connect-src 'self' https://*.blob.vercel-storage.com https://vercel.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // HSTS: dos años con subdominios. Sin "preload": activarlo exige que todos
  // los subdominios sirvan HTTPS y es casi irreversible; lo decide el dueño.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "bluetooth=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "autoplay=()",
      "fullscreen=()",
      "picture-in-picture=()",
      "interest-cohort=()",
    ].join(", "),
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Content-Security-Policy-Report-Only", value: strictCspReportOnly },
];

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
