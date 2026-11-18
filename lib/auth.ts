import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sanitizeAudit } from "./audit-sanitize";
import { writeAuditLog } from "./audit-log";
import { hashPassword, isScryptHash, verifyPassword } from "./passwords";

/**
 * Sesiones de administrador en BD (Fase 1, tramo B).
 *
 * Antes: cookie HMAC `payload.firma` con AUTH_SECRET, sin estado en BD.
 * Ahora: la cookie solo lleva un token aleatorio de 32 bytes; en
 * AdminSession solo se guarda su hash SHA-256. Las cookies HMAC viejas
 * dejan de valer con este despliegue: todos los admins entran de nuevo.
 *
 * Identidad: primero AdminUser en BD (contraseña Argon2id, roles y
 * permisos); si no hay AdminUser con ese correo, fallback por entorno
 * (ADMIN_EMAIL / ADMIN_PASSWORD_HASH) DURANTE la ventana de migración de
 * 7 días. Una vez migrado el propietario, la BD es la única fuente de
 * verdad para ese correo: el fallback por entorno ya no se prueba.
 * El fallback existe para no dejar fuera al propietario antes de migrar;
 * pasado el plazo se quitan las variables del entorno (ver
 * docs/SEGURIDAD-RBAC.md y el aviso en /admin/configuracion).
 */

const COOKIE = "caluservers_admin_session";
const SESSION_TTL_MS = 8 * 3600 * 1000;
const LAST_SEEN_WRITE_MS = 5 * 60 * 1000;

/** Permisos iniciales (misma lista que la semilla de la migración). */
export const ALL_PERMISSIONS = [
  "orders:view",
  "orders:confirm",
  "services:view",
  "services:provision",
  "services:suspend",
  "services:terminate",
  "tickets:view",
  "tickets:reply",
  "clients:view",
  "catalog:write",
  "content:write",
  "appearance:write",
  "settings:write",
  "whm:read",
  "whm:write",
  "users:manage",
  "roles:manage",
  "audit:view",
  "payments:confirm",
  "domains:view",
  "domains:write",
  "kb:write",
  "mail:write",
  "reports:view",
] as const;

export type AdminSessionInfo = {
  /** null en sesiones del fallback por entorno (aún sin AdminUser en BD). */
  userId: string | null;
  email: string;
  roles: string[];
  permissions: string[];
  stepUpAt: Date | null;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Comprobación síncrona heredada contra el hash scrypt del entorno.
 * Se mantiene por compatibilidad (la usa el test de no-enumeración y es
 * el contrato antiguo); el login usa verifyAdminPassword, que además
 * acepta hashes Argon2id en el entorno y la BD.
 */
export function checkPassword(email: string, password: string): boolean {
  const hash = process.env.ADMIN_PASSWORD_HASH || "";
  const expectedEmail = process.env.ADMIN_EMAIL || "";
  if (!expectedEmail || email.toLowerCase() !== expectedEmail.toLowerCase() || !hash.includes(":")) return false;
  const [salt, digest] = hash.split(":");
  if (!/^[0-9a-f]{32}$/i.test(salt) || !/^[0-9a-f]{128}$/i.test(digest)) return false;
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 64);
  const expected = Buffer.from(digest, "hex");
  return timingSafeEqual(actual, expected);
}

type AdminUserWithRoles = {
  id: string;
  email: string;
  passwordHash: string;
  disabledAt: Date | null;
  roles: {
    role: {
      name: string;
      permissions: { permission: { key: string } }[];
    };
  }[];
};

async function findAdminUser(email: string): Promise<AdminUserWithRoles | null> {
  try {
    return await db.adminUser.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: "insensitive" } },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
  } catch {
    // Sin BD no hay usuario en BD: el llamador decide si cae al fallback.
    return null;
  }
}

/**
 * Verifica la contraseña del administrador.
 * 1. Si hay un AdminUser con ese correo (y no está deshabilitado), solo
 *    vale su hash en BD. Al acertar con un hash scrypt heredado, se
 *    rehashea a Argon2id de forma oportunista.
 * 2. Si no hay AdminUser, fallback por entorno (scrypt o Argon2id).
 * Un AdminUser deshabilitado no entra por ninguna vía.
 */
export async function verifyAdminPassword(email: string, password: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const user = await findAdminUser(normalized);
  if (user) {
    if (user.disabledAt) return false;
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) return false;
    try {
      const data: { lastLoginAt: Date; passwordHash?: string } = { lastLoginAt: new Date() };
      if (isScryptHash(user.passwordHash)) data.passwordHash = await hashPassword(password);
      await db.adminUser.update({ where: { id: user.id }, data });
    } catch {
      // El rehash o el lastLoginAt no pueden cerrar un login correcto.
    }
    return true;
  }
  const envHash = process.env.ADMIN_PASSWORD_HASH || "";
  const envEmail = process.env.ADMIN_EMAIL || "";
  if (!envEmail || normalized !== envEmail.toLowerCase() || !envHash) return false;
  return verifyPassword(envHash, password);
}

/** Estado de la migración de identidad, para el aviso en /admin/configuracion. */
export async function adminIdentityStatus(): Promise<{
  envConfigured: boolean;
  ownerMigrated: boolean;
  dbAdminCount: number | null;
}> {
  const envConfigured = Boolean(
    (process.env.ADMIN_EMAIL || "").trim() && (process.env.ADMIN_PASSWORD_HASH || "").trim(),
  );
  let dbAdminCount: number | null = null;
  let ownerMigrated = false;
  try {
    dbAdminCount = await db.adminUser.count();
    const ownerEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (ownerEmail) {
      ownerMigrated = (await findAdminUser(ownerEmail)) !== null;
    }
  } catch {
    dbAdminCount = null;
  }
  return { envConfigured, ownerMigrated, dbAdminCount };
}

/**
 * Crea una sesión en BD y devuelve el token en claro para la cookie.
 * Si el correo tiene AdminUser, la sesión queda ligada a él; si no, es una
 * sesión del fallback por entorno (adminUserId null, permisos de owner).
 * La IP no se guarda en claro: solo su hash SHA-256.
 */
export async function createSession(
  email: string,
  opts?: { ip?: string; userAgent?: string },
): Promise<string> {
  const token = randomBytes(32);
  const user = await findAdminUser(email);
  await db.adminSession.create({
    data: {
      adminUserId: user?.id ?? null,
      tokenHash: sha256(token.toString("base64url")),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipHash: opts?.ip ? sha256(opts.ip) : null,
      userAgent: opts?.userAgent?.slice(0, 255) || null,
    },
  });
  return token.toString("base64url");
}

async function readSessionToken(): Promise<string | null> {
  try {
    return (await cookies()).get(COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Sesión actual o null. Una cookie HMAC vieja (`payload.firma`, con punto)
 * no es un token válido y se rechaza; lo mismo vale para una sesión
 * revocada, caducada o de un admin deshabilitado.
 */
export async function getAdminSession(): Promise<AdminSessionInfo | null> {
  const token = await readSessionToken();
  // 32 bytes en base64url son 43 caracteres sin relleno; cualquier cookie
  // HMAC anterior lleva un punto y no pasa este filtro.
  if (!token || token.includes(".") || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  let session: {
    id: string;
    adminUserId: string | null;
    expiresAt: Date;
    lastSeenAt: Date | null;
    revokedAt: Date | null;
    stepUpAt: Date | null;
    adminUser: AdminUserWithRoles | null;
  } | null;
  try {
    session = await db.adminSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        adminUser: {
          include: {
            roles: {
              include: {
                role: { include: { permissions: { include: { permission: true } } } },
              },
            },
          },
        },
      },
    });
  } catch {
    return null;
  }
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_WRITE_MS) {
    db.adminSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }
  if (!session.adminUser) {
    const email = process.env.ADMIN_EMAIL || "";
    if (!email) return null;
    return {
      userId: null,
      email,
      roles: ["owner"],
      permissions: [...ALL_PERMISSIONS],
      stepUpAt: session.stepUpAt,
    };
  }
  if (session.adminUser.disabledAt) return null;
  const roles = [...new Set(session.adminUser.roles.map((entry) => entry.role.name))];
  const permissions = [
    ...new Set(
      session.adminUser.roles.flatMap((entry) =>
        entry.role.permissions.map((link) => link.permission.key),
      ),
    ),
  ];
  return {
    userId: session.adminUser.id,
    email: session.adminUser.email,
    roles,
    permissions,
    stepUpAt: session.stepUpAt,
  };
}

export async function isAdmin(): Promise<boolean> {
  try {
    return (await getAdminSession()) !== null;
  } catch {
    return false;
  }
}

export async function requireAdmin(): Promise<AdminSessionInfo> {
  const session = await getAdminSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export class AuthorizationError extends Error {
  readonly status = 403;
  readonly permission: string;
  constructor(permission: string) {
    super("FORBIDDEN");
    this.name = "AuthorizationError";
    this.permission = permission;
  }
}

/**
 * Exige un permiso. Sin sesión lanza UNAUTHORIZED; con sesión pero sin el
 * permiso, deja un evento `authz.denied` saneado en AdminAudit y lanza
 * un error 403. El enforcement en rutas y páginas llega en el tramo RBAC;
 * esta es la primitiva que usará.
 */
export async function requirePermission(permission: string): Promise<AdminSessionInfo> {
  const session = await getAdminSession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (!session.permissions.includes(permission)) {
    try {
      await db.adminAudit.create({
        data: {
          action: "authz.denied",
          entityId: session.userId ?? undefined,
          details: sanitizeAudit({
            action: "authz.denied",
            actor: session.email,
            permission,
            reason: "missing-permission",
          }),
        },
      });
      // Doble escritura (Fase 6): la denegación también va a AuditLog.
      await writeAuditLog({
        actorType: "admin",
        actorId: session.email,
        action: "authz.denied",
        resourceType: "adminUser",
        resourceId: session.userId ?? undefined,
        details: {
          action: "authz.denied",
          actor: session.email,
          permission,
          reason: "missing-permission",
        },
      });
    } catch {
      // La denegación no depende de que la auditoría se guarde.
    }
    throw new AuthorizationError(permission);
  }
  return session;
}

/** Revoca la sesión de la cookie actual (logout). Best effort. */
export async function revokeCurrentSession(): Promise<void> {
  const token = await readSessionToken();
  if (!token || token.includes(".")) return;
  try {
    await db.adminSession.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // El borrado de la cookie en la ruta hace el resto.
  }
}

export const sessionCookie = COOKIE;
