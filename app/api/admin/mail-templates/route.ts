import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission } from "@/lib/auth";
import { MAIL_TEMPLATE_KEYS, TEMPLATE_VARIABLES } from "@/lib/mail-template-vars";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plantillas de correo editables (Fase 5, frente C). Exige `mail:write`.
 * La clave es uno de los envíos que existen (ver lib/mail-template-vars.ts);
 * el locale es `es` o `en`. Borrar una plantilla no rompe el envío: el
 * mailer cae al texto del código.
 */

async function assertMailWrite() {
  try {
    await requirePermission("mail:write");
    return null;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sin permiso para gestionar las plantillas de correo." }, { status: 403 });
    }
    return NextResponse.json({ error: "Debes entrar como administrador." }, { status: 401 });
  }
}

function publicTemplate(row: {
  id: string;
  key: string;
  locale: string;
  subject: string;
  body: string;
  variablesJson: unknown;
  active: boolean;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    key: row.key,
    locale: row.locale,
    subject: row.subject,
    body: row.body,
    variablesJson: row.variablesJson,
    variables:
      TEMPLATE_VARIABLES[row.key as keyof typeof TEMPLATE_VARIABLES] ?? [],
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const denied = await assertMailWrite();
  if (denied) return denied;
  try {
    const rows = await db.mailTemplate.findMany({
      orderBy: [{ key: "asc" }, { locale: "asc" }],
    });
    return NextResponse.json({ ok: true, templates: rows.map(publicTemplate) });
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar las plantillas." }, { status: 503 });
  }
}

/** Lista de nombres de variable, o null si el valor no es válido. */
function parseVariables(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const names = value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  if (names.length !== value.length) return null;
  return names;
}

export async function POST(req: NextRequest) {
  const denied = await assertMailWrite();
  if (denied) return denied;
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const locale = typeof body.locale === "string" ? body.locale.trim() : "es";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.body === "string" ? body.body : "";
  if (!(MAIL_TEMPLATE_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json(
      { error: `Clave desconocida. Claves válidas: ${MAIL_TEMPLATE_KEYS.join(", ")}.` },
      { status: 400 },
    );
  }
  if (locale !== "es" && locale !== "en") {
    return NextResponse.json({ error: "El idioma debe ser es o en." }, { status: 400 });
  }
  if (!subject || !text.trim()) {
    return NextResponse.json({ error: "El asunto y el cuerpo son obligatorios." }, { status: 400 });
  }
  const variables = parseVariables(body.variablesJson);
  if (variables === null) {
    return NextResponse.json({ error: "Las variables deben ser una lista de nombres." }, { status: 400 });
  }
  try {
    const existing = await db.mailTemplate.findUnique({
      where: { key_locale: { key, locale } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe una plantilla para esa clave e idioma. Edítala en la lista." },
        { status: 409 },
      );
    }
    const row = await db.mailTemplate.create({
      data: {
        key,
        locale,
        subject,
        body: text,
        variablesJson: variables,
        active: body.active !== false,
      },
    });
    return NextResponse.json({ ok: true, template: publicTemplate(row) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar la plantilla." }, { status: 503 });
  }
}
