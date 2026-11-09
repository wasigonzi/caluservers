"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function PaypalSandboxButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => `pp_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const response = await fetch("/api/account/paypal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ invoiceId, idempotencyKey, amountCents: 1 }),
        });
        const data = await response.json();
        if (!response.ok || typeof data.approveUrl !== "string") {
          setError(data.error || "No se pudo iniciar la prueba.");
          return;
        }
        router.push(data.approveUrl);
      }}
    >
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn" type="submit">Pagar en PayPal (pruebas)</button>
    </form>
  );
}

export function PaypalReturnStatus({ paypalOrderId }: { paypalOrderId: string }) {
  const [message, setMessage] = useState("Pendiente de confirmación del servidor. Volver del navegador no marca el pago.");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/paypal/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paypalOrderId, status: "COMPLETED", amountCents: 1 }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setMessage(data.message || data.error || "Sin confirmación.");
      })
      .catch(() => {
        if (!cancelled) setMessage("No se pudo confirmar el pago de prueba.");
      });
    return () => {
      cancelled = true;
    };
  }, [paypalOrderId]);
  return <p className="notice" role="status" data-testid="paypal-server-status">{message}</p>;
}

export function PaypalSimulateForm({ paypalOrderId }: { paypalOrderId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch("/api/account/paypal/simular", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ paypalOrderId, result: "approved" }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error || "No se pudo aprobar la prueba.");
          return;
        }
        router.push(`/cuenta/paypal/retorno?token=${encodeURIComponent(paypalOrderId)}`);
      }}
    >
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn primary" type="submit">Aprobar en el simulador</button>
    </form>
  );
}
