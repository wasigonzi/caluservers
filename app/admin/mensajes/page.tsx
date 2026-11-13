import Link from "next/link";
import { redirect } from "next/navigation";
import MessageActions from "@/components/admin/MessageActions";
import { isAdmin } from "@/lib/auth";
import { noticeRecipient } from "@/lib/contact-intake";
import { db } from "@/lib/db";
import { mailerConfigured } from "@/lib/mailer";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  contact: "Contacto",
  abuse: "Abuso",
};

function when(date: Date) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Puerto_Rico",
  }).format(date);
}

export default async function MessagesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { estado } = await searchParams;
  const status = estado === "read" || estado === "archived" ? estado : "new";

  let messages: Awaited<ReturnType<typeof db.contactMessage.findMany>> = [];
  let error = "";
  try {
    messages = await db.contactMessage.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch {
    // Falta la migración o la base no responde: se dice, no se finge una bandeja vacía.
    error =
      "No se pudo leer la bandeja. Aplica las migraciones (npx prisma migrate deploy) y revisa la base.";
  }
  const inbox = await noticeRecipient();

  return (
    <>
      <p className="accent">FORMULARIOS PROPIOS</p>
      <h1>Mensajes recibidos</h1>
      <p className="muted">
        Contacto y reportes de abuso enviados desde esta web. Se guardan aquí siempre;
        el aviso por correo es un extra.
        {inbox
          ? ` Los avisos salen hacia ${inbox}.`
          : " No hay dirección de aviso: pon el email de contacto en Marca y sitio, o CONTACT_INBOX."}
        {!mailerConfigured() ? " Sin SMTP_URL no se envía ningún aviso." : ""}
      </p>
      <p>
        <Link href="/admin/mensajes">Nuevos</Link> ·{" "}
        <Link href="/admin/mensajes?estado=read">Leídos</Link> ·{" "}
        <Link href="/admin/mensajes?estado=archived">Archivados</Link>
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {!error && !messages.length ? (
        <p className="muted">No hay mensajes en esta bandeja.</p>
      ) : null}
      <ul>
        {messages.map((message) => (
          <li key={message.id} className="glass" style={{ marginBottom: 12, padding: 12 }}>
            <p>
              <strong>
                {KIND_LABELS[message.kind] ?? message.kind} · {message.topic}
              </strong>{" "}
              · {when(message.createdAt)}
              {message.delivered ? "" : " · aviso por correo no enviado"}
            </p>
            <p>
              {message.name} ·{" "}
              <a href={`mailto:${message.email}`} rel="noopener">
                {message.email}
              </a>
              {message.target ? ` · ${message.target}` : ""}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
            <MessageActions messageId={message.id} status={message.status} />
          </li>
        ))}
      </ul>
    </>
  );
}
