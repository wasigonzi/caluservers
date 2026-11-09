"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        try {
          const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, code }),
          });
          if (!response.ok) {
            throw Error(
              response.status === 429
                ? "Demasiados intentos. Espera unos minutos."
                : "Credenciales incorrectas o configuración incompleta",
            );
          }
          router.push("/admin");
          router.refresh();
        } catch (err) {
          setError(String(err));
        }
      }}
    >
      <label className="field">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
        />
      </label>
      <label className="field">
        Contraseña
        <input
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
      </label>
      <label className="field">
        Código MFA
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Solo si ADMIN_TOTP_SECRET está activo"
        />
      </label>
      <p className="muted">
        El segundo factor es opcional. Si el entorno no define un secreto TOTP,
        deja este campo vacío.
      </p>
      <p className="error">{error}</p>
      <button className="btn">Iniciar sesión</button>
    </form>
  );
}