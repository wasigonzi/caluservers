"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { customerAuthClient } from "@/lib/customer-auth-client";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        setMessage("");
        try {
          const result = await customerAuthClient.signUp.email({ name, email, password });
          if (result.error) {
            setError(
              result.error.status === 503
                ? "El registro no está disponible ahora mismo. Inténtalo en unos minutos."
                : "No se pudo crear la cuenta. Revisa los datos o espera unos minutos.",
            );
            return;
          }
          // Sin verificación de correo: la cuenta queda activa al registrarse y
          // el registro ya inicia la sesión. Se entra directo al área de cliente.
          setMessage("Cuenta creada. Ya puedes usar tu cuenta.");
          router.push("/cuenta");
          router.refresh();
        } catch {
          setError("No hubo conexión con el servidor. Inténtalo de nuevo.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">Nombre<input autoComplete="name" value={name} required onChange={(event) => setName(event.target.value)} /></label>
      <label className="field">Email<input type="email" autoComplete="email" value={email} required onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="field">Contraseña<input type="password" autoComplete="new-password" minLength={12} value={password} required onChange={(event) => setPassword(event.target.value)} /><span className="muted">Mínimo 12 caracteres.</span></label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {message ? <p className="notice" role="status">{message}</p> : null}
      <button className="btn primary" type="submit" disabled={busy}>{busy ? "Creando…" : "Crear cuenta"}</button>
    </form>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          const result = await customerAuthClient.signIn.email({ email, password });
          if (result.error) {
            if (result.error.status === 503) {
              setError("El área de clientes no está disponible ahora mismo. Inténtalo en unos minutos.");
            } else {
              setError("No se pudo entrar. Revisa el correo y la contraseña.");
            }
            return;
          }
          router.push("/cuenta");
          router.refresh();
        } catch {
          setError("No hubo conexión con el servidor. Inténtalo de nuevo.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">Email<input type="email" autoComplete="email" value={email} required onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="field">Contraseña<input type="password" autoComplete="current-password" value={password} required onChange={(event) => setPassword(event.target.value)} /></label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!token) return <p className="error">El enlace no incluye un token válido.</p>;
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const result = await customerAuthClient.resetPassword({ newPassword: password, token });
        if (result.error) {
          setError("El enlace caducó o ya se usó.");
          return;
        }
        setMessage("Contraseña actualizada.");
        router.push("/cuenta/entrar");
      }}
    >
      <label className="field">Nueva contraseña<input type="password" minLength={12} value={password} required onChange={(event) => setPassword(event.target.value)} /></label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {message ? <p className="notice" role="status">{message}</p> : null}
      <button className="btn primary" type="submit">Guardar contraseña</button>
    </form>
  );
}

export function RecoverForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await customerAuthClient.requestPasswordReset({ email, redirectTo: "/cuenta/restablecer" });
        setMessage("Si la cuenta existe, enviaremos un enlace de un solo uso. No se muestra aquí.");
      }}
    >
      <label className="field">Email<input type="email" value={email} required onChange={(event) => setEmail(event.target.value)} /></label>
      {message ? <p className="notice" role="status">{message}</p> : null}
      <button className="btn primary" type="submit">Pedir enlace</button>
    </form>
  );
}

/**
 * Crea el pedido y, si hay pasarela configurada, enlaza el pago.
 * El dominio es obligatorio en los planes de hosting: es el que se da de alta en cPanel.
 */
export function OrderButton({
  planId,
  needsDomain = false,
  paymentReady = false,
}: {
  planId: string;
  needsDomain?: boolean;
  paymentReady?: boolean;
}) {
  const [idempotencyKey] = useState(() => `ord_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  const [domain, setDomain] = useState("");
  const [created, setCreated] = useState<{ invoiceId: string | null; summary: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (created) {
    return (
      <div>
        <p className="notice" role="status">{created.summary}</p>
        {created.invoiceId && paymentReady ? (
          <PayInvoiceButton invoiceId={created.invoiceId} />
        ) : null}
        {created.invoiceId ? (
          <p>
            <Link href={`/cuenta/facturas/${created.invoiceId}`}>
              {paymentReady ? "Ver la factura y otras formas de pago" : "Ver la factura y cómo pagarla"}
            </Link>
          </p>
        ) : null}
        <p>
          <Link href="/cuenta">Ir a mi cuenta</Link>
        </p>
      </div>
    );
  }
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/account/orders", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ planId, idempotencyKey, domain }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            setError(data.error || "No se pudo crear el pedido.");
            return;
          }
          setCreated({
            invoiceId: data.invoiceId ?? null,
            summary: `Pedido ${data.id} creado. Total ${(data.totalCents / 100).toFixed(2)} ${data.currency}.`,
          });
        } catch {
          setError("No hubo conexión al crear el pedido.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {needsDomain ? (
        <label className="field">
          Dominio para este plan
          <input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="midominio.com"
            maxLength={253}
            required
          />
          <span className="muted">
            Es el dominio con el que se crea tu cuenta cPanel. Puedes registrarlo antes o
            apuntar uno que ya tengas.
          </span>
        </label>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Creando…" : "Crear pedido"}
      </button>
    </form>
  );
}

/** Abre el cobro con PayPal para una factura. El importe lo decide el servidor. */
export function PayInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="btn primary"
        type="button"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/account/paypal", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "start", invoiceId }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data?.approveUrl) {
              setError(data?.error || "No se pudo abrir el pago.");
              setBusy(false);
              return;
            }
            window.location.href = data.approveUrl;
          } catch {
            setError("No hubo conexión con la pasarela.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Abriendo PayPal…" : "Pagar con PayPal"}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </>
  );
}

/** Cierra el cobro a la vuelta de PayPal. El id de orden lo pone PayPal en la URL. */
export function CapturePayment({
  invoiceId,
  orderId,
}: {
  invoiceId: string;
  orderId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [message, setMessage] = useState("");
  return (
    <div>
      {state === "idle" ? (
        <button
          className="btn primary"
          type="button"
          onClick={async () => {
            setState("working");
            try {
              const response = await fetch("/api/account/paypal", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "capture", invoiceId, orderId }),
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok || !data?.paid) {
                setState("failed");
                setMessage(
                  data?.error ||
                    "No se pudo confirmar el cobro. Si PayPal te cobró, lo veremos por su aviso y lo registraremos.",
                );
                return;
              }
              setState("done");
              setMessage(
                data.provisioned
                  ? "Pago confirmado y servicio dado de alta. Revisa tu correo: ahí van los datos de acceso."
                  : "Pago confirmado. El alta del servicio queda pendiente y te avisamos al terminarla.",
              );
              router.refresh();
            } catch {
              setState("failed");
              setMessage("No hubo conexión al confirmar el cobro.");
            }
          }}
        >
          Confirmar el pago
        </button>
      ) : null}
      {state === "working" ? <p className="notice">Confirmando con PayPal…</p> : null}
      {state === "done" ? (
        <p className="notice" role="status">{message}</p>
      ) : null}
      {state === "failed" ? <p className="error" role="alert">{message}</p> : null}
      {state !== "idle" && state !== "working" ? (
        <p>
          <Link href="/cuenta">Volver a tu cuenta</Link>
        </p>
      ) : null}
    </div>
  );
}

export function TicketForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        try {
          const response = await fetch("/api/account/tickets", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subject, body }),
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            setSubject("");
            setBody("");
            setMessage("Ticket abierto. Te responderemos en esta misma conversación.");
            router.refresh();
          } else {
            setMessage(data.error || "No se pudo abrir.");
          }
        } catch {
          setMessage("No hubo conexión. Inténtalo de nuevo.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">Asunto<input value={subject} required minLength={4} maxLength={120} onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="field">Mensaje<textarea value={body} required minLength={4} maxLength={4000} onChange={(event) => setBody(event.target.value)} /></label>
      {message ? <p className="notice" role="status">{message}</p> : null}
      <button className="btn primary" type="submit" disabled={busy}>Abrir ticket</button>
    </form>
  );
}

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/account/tickets", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ticketId, body }),
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            setBody("");
            router.refresh();
          } else {
            setError(data.error || "No se pudo enviar.");
          }
        } catch {
          setError("No hubo conexión. Inténtalo de nuevo.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">Tu respuesta<textarea value={body} required maxLength={4000} onChange={(event) => setBody(event.target.value)} /></label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={busy}>Enviar respuesta</button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="btn secondary"
      type="button"
      onClick={async () => {
        await customerAuthClient.signOut();
        router.push("/cuenta/entrar");
        router.refresh();
      }}
    >
      Cerrar sesión
    </button>
  );
}

export function PrintButton() {
  return (
    <button className="btn secondary small no-print" type="button" onClick={() => window.print()}>
      Imprimir o guardar PDF
    </button>
  );
}

export function ProfileForm({ name: initial, email }: { name: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage(null);
        try {
          const result = await customerAuthClient.updateUser({ name: name.trim() });
          if (result.error) {
            setMessage({ ok: false, text: "No se pudo guardar el nombre." });
          } else {
            setMessage({ ok: true, text: "Nombre guardado." });
            router.refresh();
          }
        } catch {
          setMessage({ ok: false, text: "No hubo conexión. Inténtalo de nuevo." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">Nombre<input value={name} required minLength={2} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      <label className="field">Correo<input value={email} readOnly disabled /></label>
      <p className="muted form-hint">El correo identifica tu cuenta. Para cambiarlo, abre un ticket.</p>
      {message ? <p className={message.ok ? "ok" : "error"} role={message.ok ? "status" : "alert"}>{message.text}</p> : null}
      <button className="btn" type="submit" disabled={busy || name.trim() === initial}>Guardar nombre</button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage(null);
        try {
          const result = await customerAuthClient.changePassword({
            currentPassword: current,
            newPassword: next,
            revokeOtherSessions: true,
          });
          if (result.error) {
            setMessage({ ok: false, text: "No se pudo cambiar. Revisa la contraseña actual." });
          } else {
            setCurrent("");
            setNext("");
            setMessage({ ok: true, text: "Contraseña cambiada. Las demás sesiones se cerraron." });
          }
        } catch {
          setMessage({ ok: false, text: "No hubo conexión. Inténtalo de nuevo." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">Contraseña actual<input type="password" autoComplete="current-password" value={current} required onChange={(event) => setCurrent(event.target.value)} /></label>
      <label className="field">Contraseña nueva<input type="password" autoComplete="new-password" value={next} required minLength={12} maxLength={128} onChange={(event) => setNext(event.target.value)} /></label>
      <p className="muted form-hint">Mínimo 12 caracteres.</p>
      {message ? <p className={message.ok ? "ok" : "error"} role={message.ok ? "status" : "alert"}>{message.text}</p> : null}
      <button className="btn" type="submit" disabled={busy}>Cambiar contraseña</button>
    </form>
  );
}
