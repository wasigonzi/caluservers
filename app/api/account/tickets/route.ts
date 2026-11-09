import { NextRequest, NextResponse } from "next/server";
import { CommerceError, createTicket, replyTicket } from "@/lib/commerce";
import { customerSession } from "@/lib/customer-session";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await customerSession();
  if (!session?.user.emailVerified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (body?.ticketId) {
      const message = await replyTicket({
        ticketId: String(body.ticketId),
        userId: session.user.id,
        author: "customer",
        body: String(body.body || ""),
      });
      return NextResponse.json({ id: message.id });
    }
    const ticket = await createTicket({
      userId: session.user.id,
      subject: String(body?.subject || ""),
      body: String(body?.body || ""),
    });
    return NextResponse.json({ id: ticket.id });
  } catch (error) {
    if (error instanceof CommerceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "No se pudo guardar el ticket." }, { status: 503 });
  }
}
