import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { isBlobConfiguredEnv } from "@/lib/branding-upload";
import { paymentInstructions, PAYMENT_INSTRUCTIONS_MAX } from "@/lib/billing-settings";
import { billingPolicy } from "@/lib/commerce";
import { noticeRecipient } from "@/lib/contact-intake";
import { schemaGaps } from "@/lib/admin-data";
import { db } from "@/lib/db";
import { mailerConfigured } from "@/lib/mailer";
import { paypalEnv, paypalReady, paypalWebhookReady } from "@/lib/paypal";
import { totpConfig } from "@/lib/totp";
import { whmConfiguration } from "@/lib/whm";
import { provisionConfiguration } from "@/lib/whm-provision";
import PaymentInstructionsForm from "@/components/admin/PaymentInstructionsForm";
import SystemTest from "@/components/admin/SystemTest";
import { PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración" };

type State = "ok" | "warn" | "off";
type Row = {
  label: string;
  state: State;
  value: string;
  /** Dónde se cambia: una variable de entorno o una pantalla del panel. */
  env?: string;
  href?: string;
  hrefLabel?: string;
  action?: React.ReactNode;
};

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul className="config-rows">
      {rows.map((row) => {
        const Icon = row.state === "ok" ? CircleCheck : row.state === "warn" ? CircleAlert : CircleDashed;
        return (
          <li key={row.label} className={`check-${row.state}`}>
            <Icon size={18} aria-hidden="true" />
            <div className="config-main">
              <p className="check-label">{row.label}</p>
              <p className="muted">{row.value}</p>
              {row.action}
            </div>
            <div className="config-where">
              {row.href ? (
                <Link className="btn secondary small" href={row.href}>
                  {row.hrefLabel ?? "Configurar"}
                </Link>
              ) : null}
              {row.env ? <code>{row.env}</code> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function ConfigPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const policy = billingPolicy();
  const [whm, provision, inbox, gaps, migrations] = await Promise.all([
    whmConfiguration().catch(() => null),
    provisionConfiguration().catch(() => null),
    noticeRecipient().catch(() => ""),
    schemaGaps().catch(() => [] as string[]),
    db
      .$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
      .then((rows) => Number(rows[0]?.count ?? 0))
      .catch(() => null),
  ]);
  const instructions = await paymentInstructions();
  const mfa = totpConfig(process.env.ADMIN_TOTP_SECRET);
  const customerAuth = (process.env.BETTER_AUTH_SECRET || "").length >= 32;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const mail = mailerConfigured();
  const mailFrom = (process.env.MAIL_FROM || "").trim();
  const blob = isBlobConfiguredEnv();
  const currencySet = /^[A-Z]{3}$/.test((process.env.BILLING_CURRENCY || "").trim());

  const business: Row[] = [
    {
      label: "Moneda de cobro",
      state: currencySet ? "ok" : "warn",
      value: currencySet
        ? (process.env.BILLING_CURRENCY || "").trim()
        : "Sin definir. Sin moneda no se pueden crear pedidos.",
      env: "BILLING_CURRENCY",
    },
    {
      label: "Impuestos",
      state: policy.ok ? "ok" : "warn",
      value: policy.ok
        ? "Sin impuesto (TAX_MODE=none)."
        : "Sin decidir. Los pedidos quedan como proforma y no se pueden cobrar.",
      env: "TAX_MODE",
    },
    {
      label: "Cobro con PayPal",
      state: paypalReady() ? (paypalWebhookReady() ? "ok" : "warn") : "off",
      value: paypalReady()
        ? paypalWebhookReady()
          ? `Activo en modo ${paypalEnv()}, con webhook verificado.`
          : `Activo en modo ${paypalEnv()}, pero falta el webhook: los avisos de PayPal se rechazan.`
        : "Desactivado. Los cobros se confirman a mano desde Pedidos y facturas.",
      env: "PAYPAL_ENV · PAYPAL_CLIENT_ID · PAYPAL_CLIENT_SECRET · PAYPAL_WEBHOOK_ID",
    },
    {
      label: "Catálogo y precios",
      state: "ok",
      value: "Los planes y sus precios se editan en el panel y se publican al instante.",
      href: "/admin/site?seccion=catalog",
      hrefLabel: "Editar catálogo",
    },
  ];

  const mailRows: Row[] = [
    {
      label: "Correo saliente (SMTP)",
      state: mail ? "ok" : "warn",
      value: mail
        ? `Activo. Remitente: ${mailFrom || "sin MAIL_FROM (se usa no-reply@localhost)"}.`
        : "Sin configurar. No salen verificaciones de cuenta, avisos ni credenciales de alta.",
      env: "SMTP_URL · MAIL_FROM",
      action: <SystemTest action="test-email" label="Enviar correo de prueba" disabled={!mail} />,
    },
    {
      label: "Buzón de avisos internos",
      state: inbox ? "ok" : "warn",
      value: inbox
        ? `Los formularios y los tickets avisan a ${inbox}.`
        : "Sin dirección. Pon el email de contacto del sitio o define CONTACT_INBOX.",
      href: "/admin/site?seccion=content",
      hrefLabel: "Email de contacto",
      env: "CONTACT_INBOX",
    },
  ];

  const security: Row[] = [
    {
      label: "Cuenta de administrador",
      state: "ok",
      value: `${process.env.ADMIN_EMAIL || "sin correo"}. La sesión dura 8 horas.`,
      env: "ADMIN_EMAIL · ADMIN_PASSWORD_HASH",
    },
    {
      label: "Verificación en dos pasos",
      state: mfa === "ready" ? "ok" : "warn",
      value:
        mfa === "ready"
          ? "Activa: el acceso pide un código de 6 dígitos."
          : mfa === "invalid"
            ? "El secreto definido no es válido y bloquea el acceso con código."
            : "Desactivada. El acceso solo pide correo y contraseña. Genera un secreto con «npm run admin:totp».",
      env: "ADMIN_TOTP_SECRET",
    },
    {
      label: "Límite de intentos de acceso",
      state: "ok",
      value: "Siempre activo y compartido entre instancias. Si la base no responde, el acceso se cierra.",
    },
    {
      label: "Registro de clientes",
      state: customerAuth ? "ok" : "warn",
      value: customerAuth
        ? "Activo, con verificación de correo obligatoria."
        : "Desactivado: sin el secreto, el registro responde 503.",
      env: "BETTER_AUTH_SECRET · BETTER_AUTH_URL",
    },
  ];

  const platform: Row[] = [
    {
      label: "Base de datos",
      state: migrations === null || gaps.length ? "warn" : "ok",
      value: gaps.length
        ? `Conectada, pero le faltan migraciones: no existe ${gaps.join(", ")}. Aplica «npx prisma migrate deploy» con la DATABASE_URL de este entorno.`
        : migrations === null
          ? "No se pudo leer el estado de las migraciones."
          : `Conectada y al día, con ${migrations} migraciones aplicadas.`,
      env: "DATABASE_URL",
      action: <SystemTest action="test-database" label="Probar conexión" />,
    },
    {
      label: "URL pública del sitio",
      state: siteUrl ? "ok" : "warn",
      value: siteUrl || "Sin definir. Hace falta para el retorno de PayPal, el sitemap y los enlaces de los correos.",
      env: "NEXT_PUBLIC_SITE_URL",
    },
    {
      label: "Subida de imágenes",
      state: blob ? "ok" : "off",
      value: blob
        ? "Activa: puedes subir logos e imágenes desde Branding."
        : "Desactivada. En Branding se pegan URLs https en lugar de subir archivos.",
      env: "BLOB_READ_WRITE_TOKEN",
      href: "/admin/site",
      hrefLabel: "Branding",
    },
  ];

  const server: Row[] = [
    {
      label: "Conexión WHM (lectura)",
      state: whm ? (whm.configured ? "ok" : "off") : "warn",
      value: whm
        ? whm.configured
          ? `Configurada${whm.url ? ` contra ${whm.url}` : ""}.`
          : "Pendiente. Sin ella no se listan cuentas ni paquetes."
        : "No se pudo leer la configuración.",
      href: "/admin/settings",
    },
    {
      label: "Alta automática en WHM",
      state: provision ? (provision.ready ? "ok" : provision.enabled ? "warn" : "off") : "warn",
      value: provision
        ? provision.ready
          ? "Lista: crea la cuenta cPanel al confirmarse el pago."
          : provision.enabled
            ? "Activada pero incompleta: falta token, paquete o correo saliente."
            : "Desactivada. Las altas se marcan a mano desde Servicios."
        : "No se pudo leer la configuración.",
      href: "/admin/provision",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CONFIGURACIÓN"
        title="Configuración general"
        description="El estado real de cada pieza de la plataforma y dónde se cambia. Lo que lleva secretos (claves, contraseñas, tokens) se define como variable de entorno en el hosting y aquí solo se ve si está puesto, nunca su valor."
      />
      <div className="config-grid">
        <section className="panel" aria-labelledby="cfg-business">
          <h2 id="cfg-business">Negocio y cobros</h2>
          <Rows rows={business} />
          <div className="config-form">
            <h3>Instrucciones de pago manual</h3>
            <p className="muted">
              Lo que el cliente ve en una factura pendiente para pagarte fuera de PayPal:
              transferencia, ATH Móvil, depósito… Tú confirmas el cobro en Pedidos y facturas.
            </p>
            <PaymentInstructionsForm initial={instructions} max={PAYMENT_INSTRUCTIONS_MAX} />
          </div>
        </section>
        <section className="panel" aria-labelledby="cfg-mail">
          <h2 id="cfg-mail">Correo y avisos</h2>
          <Rows rows={mailRows} />
        </section>
        <section className="panel" aria-labelledby="cfg-security">
          <h2 id="cfg-security">Acceso y seguridad</h2>
          <Rows rows={security} />
        </section>
        <section className="panel" aria-labelledby="cfg-platform">
          <h2 id="cfg-platform">Plataforma</h2>
          <Rows rows={platform} />
        </section>
        <section className="panel" aria-labelledby="cfg-server">
          <h2 id="cfg-server">Servidor WHM / cPanel</h2>
          <Rows rows={server} />
        </section>
        <section className="panel" aria-labelledby="cfg-site">
          <h2 id="cfg-site">Sitio web</h2>
          <ul className="config-links">
            <li><Link href="/admin/site">Branding</Link><span className="muted">Nombre, logos, favicon</span></li>
            <li><Link href="/admin/site?seccion=appearance">Apariencia</Link><span className="muted">Colores y tipografía</span></li>
            <li><Link href="/admin/site?seccion=content">Contenido y contacto</Link><span className="muted">Portada, contacto, redes</span></li>
            <li><Link href="/admin/site?seccion=sections">Secciones del inicio</Link><span className="muted">Orden y visibilidad</span></li>
            <li><Link href="/admin/site?seccion=seo">SEO</Link><span className="muted">Título y descripción</span></li>
            <li><Link href="/admin/site?seccion=nav">Navegación</Link><span className="muted">Cabecera, pie y móvil</span></li>
            <li><Link href="/admin/pages">Textos de páginas</Link><span className="muted">Contenido por página</span></li>
          </ul>
        </section>
      </div>
      <p className="muted config-note">
        Las variables de entorno se cambian en el panel de tu hosting (en Vercel: Settings →
        Environment Variables) y hace falta un nuevo despliegue para que apliquen.
      </p>
    </>
  );
}
