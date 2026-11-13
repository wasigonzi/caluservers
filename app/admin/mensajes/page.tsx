import { redirect } from "next/navigation";
import type { ContactMessage } from "@prisma/client";
import MessageActions from "@/components/admin/MessageActions";
import { isAdmin } from "@/lib/auth";
import { PAGE_SIZE } from "@/lib/admin-data";
import { dateTime, pageNumber } from "@/lib/admin-format";
import { noticeRecipient } from "@/lib/contact-intake";
import { db } from "@/lib/db";
import { mailerConfigured } from "@/lib/mailer";
import {
  EmptyState,
  FilterTabs,
  LoadError,
  PageHeader,
  Pagination,
  StatusBadge,
  withQuery,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  contact: "Contacto",
  abuse: "Abuso",
};

export default async function MessagesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; p?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const params = await searchParams;
  const status = params.estado === "read" || params.estado === "archived" ? params.estado : "new";

  let messages: ContactMessage[] = [];
  let failed = false;
  let total = 0;
  let page = 1;
  let pages = 1;
  let counts = new Map<string, number>();
  try {
    const grouped = await db.contactMessage.groupBy({ by: ["status"], _count: true });
    counts = new Map(grouped.map((g) => [g.status, g._count]));
    total = counts.get(status) ?? 0;
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = pageNumber(params.p, pages);
    messages = await db.contactMessage.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
  } catch {
    // Falta la migración o la base no responde: se dice, no se finge una bandeja vacía.
    failed = true;
  }
  const inbox = await noticeRecipient();
  const tab = (label: string, key: string) => ({
    label,
    count: counts.get(key) ?? 0,
    active: status === key,
    href: withQuery("/admin/mensajes", { estado: key === "new" ? undefined : key }),
  });

  return (
    <>
      <PageHeader
        eyebrow="FORMULARIOS PROPIOS"
        title="Mensajes recibidos"
        description={
          <>
            Contacto y reportes de abuso enviados desde esta web. Se guardan aquí siempre; el
            aviso por correo es un extra.
            {inbox
              ? ` Los avisos salen hacia ${inbox}.`
              : " No hay dirección de aviso: pon el email de contacto en Marca y sitio, o CONTACT_INBOX."}
            {!mailerConfigured() ? " Sin SMTP_URL no se envía ningún aviso." : ""}
          </>
        }
      />
      <div className="toolbar">
        <FilterTabs
          label="Bandejas"
          items={[tab("Nuevos", "new"), tab("Leídos", "read"), tab("Archivados", "archived")]}
        />
      </div>
      {failed ? <LoadError what="la bandeja" /> : null}
      {!failed && !messages.length ? <EmptyState title="No hay mensajes en esta bandeja." /> : null}
      <ul className="message-list">
        {messages.map((message) => (
          <li key={message.id} className="panel message-card">
            <div className="message-head">
              <div>
                <p className="message-topic">
                  <StatusBadge
                    info={{
                      label: KIND_LABELS[message.kind] ?? message.kind,
                      tone: message.kind === "abuse" ? "danger" : "info",
                    }}
                  />
                  <strong>{message.topic}</strong>
                </p>
                <p className="muted">
                  {message.name} ·{" "}
                  <a className="row-link" href={`mailto:${message.email}`} rel="noopener">
                    {message.email}
                  </a>
                  {message.target ? ` · ${message.target}` : ""}
                </p>
              </div>
              <p className="muted message-when">
                {dateTime(message.createdAt)}
                {message.delivered ? "" : " · aviso por correo no enviado"}
              </p>
            </div>
            <p className="message-body">{message.body}</p>
            <div className="row-actions">
              <a
                className="btn small"
                href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.topic}`)}`}
                rel="noopener"
              >
                Responder por correo
              </a>
              <MessageActions messageId={message.id} status={message.status} />
            </div>
          </li>
        ))}
      </ul>
      <Pagination
        page={page}
        pages={pages}
        total={total}
        hrefFor={(p) => withQuery("/admin/mensajes", { estado: status === "new" ? undefined : status, p })}
      />
    </>
  );
}
