"use client";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { intakeTopics, type ContactKind } from "@/lib/intake-options";

type Labels = {
  name: string;
  email: string;
  topic: string;
  target?: string;
  message: string;
  submit: string;
};

type Status =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent"; message: string }
  | { state: "error"; message: string };

/**
 * Formulario propio de contacto y de abuso. Publica en /api/contact (mismo origen).
 * No afirma envío si la API no respondió ok: el estado viene de la respuesta.
 */
export default function IntakeForm({
  kind,
  labels,
  note,
}: {
  kind: ContactKind;
  labels: Labels;
  note: string;
}) {
  const uid = useId();
  const topics = intakeTopics(kind);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState(topics[0] ?? "");
  const [target, setTarget] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const sending = status.state === "sending";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setStatus({ state: "sending" });
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name, email, topic, target, body }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; message?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        setStatus({
          state: "error",
          message:
            payload?.error ||
            "No se pudo enviar el mensaje. Vuelve a intentarlo en unos minutos.",
        });
        return;
      }
      setStatus({
        state: "sent",
        message: payload.message || "Mensaje recibido.",
      });
      setName("");
      setEmail("");
      setTarget("");
      setBody("");
    } catch {
      setStatus({
        state: "error",
        message: "No hubo conexión con el servidor. Revisa tu red e inténtalo otra vez.",
      });
    }
  }

  if (status.state === "sent") {
    return (
      <div className="formbox glass">
        <p className="notice" role="status">
          {status.message}
        </p>
        <button
          className="btn"
          type="button"
          onClick={() => setStatus({ state: "idle" })}
        >
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  return (
    <form className="formbox glass" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor={`${uid}-name`}>{labels.name}</label>
        <input
          id={`${uid}-name`}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="name"
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-email`}>{labels.email}</label>
        <input
          id={`${uid}-email`}
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={160}
          autoComplete="email"
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-topic`}>{labels.topic}</label>
        <select
          id={`${uid}-topic`}
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          {topics.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      {labels.target ? (
        <div className="field">
          <label htmlFor={`${uid}-target`}>{labels.target}</label>
          <input
            id={`${uid}-target`}
            name="target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            maxLength={120}
            required
          />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={`${uid}-body`}>{labels.message}</label>
        <textarea
          id={`${uid}-body`}
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          required
        />
      </div>
      <button className="btn primary" type="submit" disabled={sending}>
        {sending ? "Enviando…" : labels.submit}
      </button>
      {status.state === "error" ? (
        <p className="notice" role="alert">
          {status.message}
        </p>
      ) : null}
      <p className="muted">{note}</p>
    </form>
  );
}
