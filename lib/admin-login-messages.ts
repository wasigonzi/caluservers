export const LOGIN_CODES = [
  "origin",
  "rate",
  "config",
  "database",
  "migration",
  "credentials",
  "mfa",
  "mfa-config",
  "unexpected",
] as const;

export type LoginCode = (typeof LOGIN_CODES)[number];

const GAP_NAMES = ["ADMIN_EMAIL", "ADMIN_PASSWORD_HASH", "AUTH_SECRET"] as const;
export type AccessGap = (typeof GAP_NAMES)[number];

export function accessGapNames(values: unknown): AccessGap[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is AccessGap =>
    typeof value === "string" && (GAP_NAMES as readonly string[]).includes(value),
  );
}

export function isLoginCode(value: unknown): value is LoginCode {
  return typeof value === "string" && (LOGIN_CODES as readonly string[]).includes(value);
}

/** Texto visible. No afirma que la contraseña sea la causa si el código no es de credenciales. */
export function adminLoginMessage(code: LoginCode, missing: AccessGap[] = []): string {
  if (code === "origin") {
    return "La solicitud no llega desde el mismo sitio que la página. No se han comprobado el correo ni la contraseña.";
  }
  if (code === "rate") return "Demasiados intentos. Espera unos minutos.";
  if (code === "config") {
    const names = missing.length ? missing.join(", ") : "ADMIN_EMAIL, ADMIN_PASSWORD_HASH o AUTH_SECRET";
    return `Configuración de acceso incompleta (${names}). No se ha comprobado la contraseña.`;
  }
  if (code === "database") {
    return "No se pudo usar la base de datos del límite de acceso. El ingreso queda cerrado y no se ha comprobado la contraseña.";
  }
  if (code === "migration") {
    return "Falta la tabla LoginThrottle en la base de datos. El ingreso queda cerrado y no se ha comprobado la contraseña.";
  }
  if (code === "credentials") {
    return "El correo o el verificador no coinciden con la configuración. Con la configuración completa no se puede distinguir aquí cuál de los dos falla.";
  }
  if (code === "mfa") {
    return "El código MFA no es válido. El secreto TOTP del entorno está activo; un campo vacío también falla.";
  }
  if (code === "mfa-config") {
    return "ADMIN_TOTP_SECRET está definido, pero no es un secreto TOTP válido. El segundo factor no se puede comprobar.";
  }
  return "No se pudo completar el acceso por un error interno. No indica por sí solo que la contraseña sea incorrecta.";
}

export function loginCodeFromStatus(status: number): LoginCode {
  if (status === 429) return "rate";
  if (status === 403) return "origin";
  if (status === 401) return "credentials";
  if (status === 503) return "database";
  return "unexpected";
}
