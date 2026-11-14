"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan } from "@/lib/catalog";

export default function CheckoutForm({
  plans,
  selectedPlan,
}: {
  plans: Plan[];
  selectedPlan: Plan | null;
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState(selectedPlan?.id ?? "");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = plans.find((p) => p.id === planId) ?? null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selected) {
      setError("Elige un plan.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selected.id,
          domain: domain.trim().toLowerCase(),
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim().toLowerCase(),
        }),
      });
      const value: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          value && typeof value === "object" && "error" in value
            ? String((value as { error: unknown }).error)
            : "No se pudo crear el pedido.";
        setError(message);
        return;
      }
      const lookupToken =
        value && typeof value === "object" && "lookupToken" in value
          ? String((value as { lookupToken: unknown }).lookupToken)
          : "";
      if (!lookupToken) {
        setError("No se pudo crear el pedido.");
        return;
      }
      router.push(`/pedido/${lookupToken}`);
    } catch {
      setError("No se pudo crear el pedido. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="formbox glass" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="checkout-plan">Plan de hosting</label>
        <select
          id="checkout-plan"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          required
        >
          <option value="">Elige un plan…</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.price} / mes
            </option>
          ))}
        </select>
      </div>
      {selected ? (
        <p className="muted">
          {selected.description} · {selected.features.slice(0, 3).join(" · ")}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="checkout-domain">Dominio</label>
        <input
          id="checkout-domain"
          type="text"
          autoComplete="off"
          placeholder="midominio.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          required
        />
        <small className="muted">
          El dominio principal de tu cuenta cPanel.
        </small>
      </div>
      <div className="field">
        <label htmlFor="checkout-name">Nombre completo</label>
        <input
          id="checkout-name"
          type="text"
          autoComplete="name"
          placeholder="Tu nombre"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="checkout-email">Correo</label>
        <input
          id="checkout-email"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          required
        />
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Creando pedido…" : "Crear pedido →"}
      </button>
      <p className="muted">
        Tu pedido queda registrado como pendiente de pago. Cuando el pago se
        confirme, tu cuenta de hosting se crea automáticamente y podrás seguir
        su estado desde el enlace de seguimiento.
      </p>
    </form>
  );
}
