"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  accessGapNames,
  adminLoginMessage,
  isLoginCode,
  loginCodeFromStatus,
} from "@/lib/admin-login-messages";

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
            const data = await response.json().catch(() => ({}));
            const code = isLoginCode(data?.code) ? data.code : loginCodeFromStatus(response.status);
            setError(adminLoginMessage(code, accessGapNames(data?.missing)));
            return;
          }
          router.push("/admin");
          router.refresh();
        } catch {
          setError(adminLoginMessage("unexpected"));
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
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn">Iniciar sesión</button>
    </form>
  );
}