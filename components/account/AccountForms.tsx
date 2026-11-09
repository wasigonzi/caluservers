"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { customerAuthClient } from "@/lib/customer-auth-client";

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const result = await customerAuthClient.signUp.email({ name, email, password });
        if (result.error) {
          setError("No se pudo crear la cuenta. Revisa los datos o espera unos minutos.");
          return;
        }
        setMessage("Cuenta creada. Revisa el correo de verificación. El enlace no se muestra aquí.");
      }}
    >
      <label className="field">Nombre<input value={name} required onChange={(event) => setName(event.target.value)} /></label>
      <label className="field">Email<input type="email" value={email} required onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="field">Contraseña<input type="password" minLength={12} value={password} required onChange={(event) => setPassword(event.target.value)} /></label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {message ? <p className="notice" role="status">{message}</p> : null}
      <button className="btn primary" type="submit">Crear cuenta</button>
    </form>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const result = await customerAuthClient.signIn.email({ email, password });
        if (result.error) {
          setError("No se pudo entrar. Verifica el correo y la contraseña.");
          return;
        }
        router.push("/cuenta");
        router.refresh();
      }}
    >
      <label className="field">Email<input type="email" value={email} required onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="field">Contraseña<input type="password" value={password} required onChange={(event) => setPassword(event.target.value)} /></label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn primary" type="submit">Entrar</button>
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

export function OrderButton({ planId }: { planId: string }) {
  const [idempotencyKey] = useState(() => `ord_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const response = await fetch("/api/account/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planId, idempotencyKey }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error || "No se pudo crear el pedido.");
          return;
        }
        setMessage(`Pedido ${data.id}. Total ${data.totalCents} centavos ${data.currency}. El pago no se marca solo.`);
      }}
    >
      {error ? <p className="error" role="alert">{error}</p> : null}
      {message ? <p className="notice" role="status">{message}</p> : null}
      <button className="btn primary" type="submit">Crear pedido</button>
    </form>
  );
}

export function TicketForm() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch("/api/account/tickets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, body }),
        });
        const data = await response.json();
        setMessage(response.ok ? `Ticket ${data.id} abierto.` : data.error || "No se pudo abrir.");
      }}
    >
      <label className="field">Asunto<input value={subject} required onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="field">Mensaje<textarea value={body} required onChange={(event) => setBody(event.target.value)} /></label>
      {message ? <p className="notice" role="status">{message}</p> : null}
      <button className="btn primary" type="submit">Abrir ticket</button>
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
