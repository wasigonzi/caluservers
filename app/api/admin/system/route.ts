import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { deliverNotice, mailerConfigured } from "@/lib/mailer";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Comprobaciones activas del panel de configuración. No cambian ningún ajuste. */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);

  if (body?.action === "test-email") {
    const to = (process.env.ADMIN_EMAIL || "").trim();
    if (!to) return NextResponse.json({ error: "ADMIN_EMAIL no está definido." }, { status: 409 });
    if (!mailerConfigured()) {
      return NextResponse.json(
        { error: "No hay correo saliente configurado. Define SMTP_URL y MAIL_FROM." },
        { status: 409 },
      );
    }
    try {
      const result = await deliverNotice({
        to,
        subject: "Prueba de correo de CaluServers",
        text: "Este mensaje confirma que el correo saliente del panel funciona.",
      });
      if (!result.delivered) {
        return NextResponse.json({ error: "El correo no salió." }, { status: 502 });
      }
      await db.adminAudit
        .create({ data: { action: "system.test_email", details: `via=${result.reason}` } })
        .catch(() => {});
      return NextResponse.json({ ok: true, to, via: result.reason });
    } catch {
      // El error de SMTP puede llevar el servidor o el usuario: no se devuelve.
      return NextResponse.json(
        { error: "El servidor de correo rechazó el envío. Revisa SMTP_URL, el usuario y el remitente." },
        { status: 502 },
      );
    }
  }

  if (body?.action === "test-database") {
    const started = Date.now();
    try {
      await db.$queryRaw`SELECT 1`;
      return NextResponse.json({ ok: true, ms: Date.now() - started });
    } catch {
      return NextResponse.json({ error: "La base de datos no respondió." }, { status: 503 });
    }
  }

  return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
}
