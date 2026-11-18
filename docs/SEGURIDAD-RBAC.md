# Seguridad y RBAC — identidad de administrador (Fase 1, tramo B)

## Modelo de identidad

Hay dos clases de usuarios, con sistemas distintos:

| | Administrador | Cliente |
|---|---|---|
| Tabla | `AdminUser` | `User` (better-auth) |
| Contraseña | Argon2id (`passwordHash`) | Argon2id en `Account.password` |
| Sesión | `AdminSession` (token aleatorio, en BD solo su hash SHA-256) | Sesión better-auth (`Session`) |
| Permisos | `Role` / `Permission` / `RolePermission` / `AdminUserRole` | Sin roles por ahora |

**Argon2id** (todo lo nuevo): parámetros OWASP por defecto — memoria
19 MiB (`ARGON2_MEMORY_KIB=19456`), `t=2`, `p=1`, salida 32 bytes — en
`lib/passwords.ts` (`hashPassword` / `verifyPassword` / `isArgon2idHash`).
Los valores se pueden ajustar con `ARGON2_MEMORY_KIB`, `ARGON2_TIME` y
`ARGON2_PARALLELISM` (ver `.env.example`); sin ellos se usan los defaults.

**Verificación dual** (`lib/passwords.ts`): un hash se acepta si es
Argon2id (`$argon2id$...`) o si tiene el formato scrypt heredado
(`<salt hex 32>:<digest hex 128>`). El formato scrypt no guarda los
parámetros, y existen dos variantes en producción:

- Admin por entorno (script antiguo y `lib/auth.ts`): defaults de Node,
  N=16384, r=8, p=1.
- Clientes better-auth (`@better-auth/utils/password`): N=16384, r=16, p=1.

`verifyPassword` prueba ambas variantes (primero r=8). Un hash scrypt que
verifica bien se **rehashea a Argon2id en ese mismo login** (rehash
oportunista, solo con la contraseña correcta en la mano).

## Sesiones de administrador

- La cookie `caluservers_admin_session` solo lleva el token aleatorio de
  32 bytes (base64url, 43 caracteres). En BD solo se guarda su hash SHA-256.
- Duración: 8 horas. `httpOnly`, `SameSite: strict`, `secure` en producción.
- La IP no se guarda en claro: solo su hash SHA-256 (`ipHash`). El
  `userAgent` se guarda truncado a 255 caracteres.
- `lastSeenAt` se actualiza como mucho una vez cada 5 minutos.
- El logout revoca la sesión en BD (`revokedAt`) y borra la cookie.
- `stepUpAt` existe en el modelo para el tramo de step-up; este tramo no lo
  escribe ni lo exige.

**Las cookies HMAC viejas caducan con este despliegue.** El formato
anterior (`payload.firma` con `AUTH_SECRET`) ya no se acepta: cualquier
cookie con punto se rechaza y `getAdminSession()` devuelve null. Todos los
admins tienen que entrar de nuevo después del despliegue.

## Migración del administrador propietario

El propietario pasa del entorno a la base con:

```bash
ADMIN_EMAIL=... ADMIN_PASSWORD_HASH=... DATABASE_URL=... node scripts/admin-migrate.mjs
```

El script pide la contraseña actual por stdin, la verifica contra el hash
scrypt (o Argon2id) de `ADMIN_PASSWORD_HASH` y, si coincide, crea el
`AdminUser` con la contraseña guardada como Argon2id y el rol `owner`.
Si ya existe un `AdminUser` con ese correo, se niega sin tocar nada. La
contraseña en claro nunca se imprime ni se guarda. Requiere la migración
`20261118010000_admin_identity_rbac` aplicada (los roles los siembra la
migración).

### Ventana de 7 días del fallback por entorno

Durante los 7 días siguientes al despliegue, el login por entorno
(`ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`) sigue funcionando para el correo
que aún no tiene `AdminUser` en BD. `/admin/configuracion` muestra el aviso
mientras el fallback siga activo, y también avisa cuando la cuenta ya está
en BD pero las variables siguen definidas.

Reglas exactas (`lib/auth.ts`, `verifyAdminPassword`):

- Si hay un `AdminUser` con ese correo y no está deshabilitado, **solo**
  vale su hash en BD. El fallback por entorno ya no se prueba para ese
  correo, aunque las variables sigan definidas.
- Si el `AdminUser` está deshabilitado (`disabledAt`), no entra por
  ninguna vía.
- Si no hay `AdminUser` con ese correo, vale el fallback por entorno
  (hash scrypt heredado o Argon2id generado con `npm run admin:hash`).

El código no conoce la fecha del despliegue, así que la ventana de 7 días
es operativa, no un temporizador en código: pasado el plazo, el propietario
**quita `ADMIN_EMAIL` y `ADMIN_PASSWORD_HASH` del entorno** y el fallback
desaparece. El aviso de `/admin/configuracion` es el recordatorio.

Generar un hash nuevo para el entorno (si hace falta antes de migrar):

```bash
npm run admin:hash   # imprime ADMIN_PASSWORD_HASH=<hash argon2id>
```

## Roles y permisos iniciales

Sembrados por la migración `20261118010000_admin_identity_rbac`
(`INSERT ... ON CONFLICT DO NOTHING`, idempotente):

- `owner`: los 18 permisos. Único rol que gestiona roles (`roles:manage`).
  La rotación de claves queda reservada a owner sin permiso propio por ahora.
- `admin`: los 18 menos `roles:manage` (17).
- `soporte`: `tickets:view`, `tickets:reply`, `clients:view`, `orders:view`,
  `services:view`, `audit:view` (6).

Permisos (18): `orders:view`, `orders:confirm`, `services:view`,
`services:provision`, `services:suspend`, `tickets:view`, `tickets:reply`,
`clients:view`, `catalog:write`, `content:write`, `appearance:write`,
`settings:write`, `whm:read`, `whm:write`, `users:manage`, `roles:manage`,
`audit:view`, `payments:confirm`.

La primitiva de enforcement es `requirePermission(perm)` en `lib/auth.ts`:
sin sesión lanza `UNAUTHORIZED`; con sesión pero sin el permiso, escribe un
evento `authz.denied` saneado en `AdminAudit` y lanza `AuthorizationError`
(403).

## Enforcement (Fase 1, tramo D)

Desde este tramo, el permiso se exige de verdad en rutas API, páginas y
menú; el tramo B solo dejaba la primitiva.

### Matriz rol × permiso

Roles sembrados por la migración `20261118010000_admin_identity_rbac`:

| Permiso | owner (18) | admin (17) | soporte (6) |
|---|---|---|---|
| `orders:view` | ✓ | ✓ | ✓ |
| `orders:confirm` | ✓ | ✓ | — |
| `services:view` | ✓ | ✓ | ✓ |
| `services:provision` | ✓ | ✓ | — |
| `services:suspend` | ✓ | ✓ | — |
| `tickets:view` | ✓ | ✓ | ✓ |
| `tickets:reply` | ✓ | ✓ | ✓ |
| `clients:view` | ✓ | ✓ | ✓ |
| `catalog:write` | ✓ | ✓ | — |
| `content:write` | ✓ | ✓ | — |
| `appearance:write` | ✓ | ✓ | — |
| `settings:write` | ✓ | ✓ | — |
| `whm:read` | ✓ | ✓ | — |
| `whm:write` | ✓ | ✓ | — |
| `users:manage` | ✓ | ✓ | — |
| `roles:manage` | ✓ | — | — |
| `audit:view` | ✓ | ✓ | ✓ |
| `payments:confirm` | ✓ | ✓ | — |

La única diferencia entre `owner` y `admin` es `roles:manage`. `soporte`
solo lee pedidos/servicios/clientes/tickets y responde tickets, y ve la
auditoría. La sesión del fallback por entorno (sin `AdminUser`) tiene los
18 permisos, como owner, hasta que el propietario migre.

### Permiso por acción de commerce (`app/api/admin/commerce/route.ts`)

| Acción | Permiso |
|---|---|
| `confirm-payment` | `payments:confirm` |
| `service-status` (cancelar o reactivar) | `services:suspend` |
| `provision-service` | `services:provision` |
| `reply-ticket` | `tickets:reply` |
| `ticket-status` | `tickets:reply` |
| `void-invoice` | `payments:confirm` |
| `message-status` | `tickets:view` |

Sin el permiso: 403 y evento `authz.denied`. Sin sesión: 401. La
comprobación va antes de tocar la base o WHM.

### Otras rutas API de admin

| Ruta | Permiso |
|---|---|
| `GET/POST /api/admin/catalog` | `catalog:write` (no hay `catalog:view`) |
| `GET/POST /api/admin/site-settings` | `content:write` **o** `appearance:write` (el estudio publica el bundle junto; con ninguno de los dos, un solo `authz.denied`) |
| `GET/POST /api/admin/page-content` | `content:write` (no hay `content:view`) |
| `POST /api/admin/system` (test-email, test-database, save-payment-instructions) | `settings:write` |
| `GET/POST /api/admin/branding-upload` | `appearance:write` |
| `POST /api/admin/whm` (test/overview/listaccts/listpkgs) | `whm:read` |
| `GET /api/admin/whm/settings` | `whm:read` |
| `POST /api/admin/whm/settings` | `whm:write` |
| `GET /api/admin/provision` | `whm:read` |
| `POST /api/admin/provision` | `whm:write` |
| `POST /api/admin/settings` (heredada, siempre 410) | `whm:read` |
| `GET/POST /api/admin/users` | `users:manage` |

### Menú y páginas

`components/admin/AdminShell.tsx` oculta las secciones sin permiso (la
prop `permissions` la pasa el layout del servidor desde
`getAdminSession()`). El Dashboard lo ve cualquier admin. Cada página
protegida rechaza además por su cuenta con `AccessDenied` si se llega por
URL directa: Actividad `audit:view`, Clientes `clients:view`, Pedidos y
facturas `orders:view`, Servicios `services:view`, Tickets y Mensajes
`tickets:view`, Textos de páginas `content:write`, Cuentas/Paquetes/
Conexión WHM/Alta automática `whm:read`, General `settings:write`,
Usuarios `users:manage`. `/admin/site` exige uno de `content:write`,
`catalog:write` o `appearance:write`; cada guardado lo exige además en su
ruta.

### Panel de apariencia separado

`/admin/apariencia` es una ruta propia, separada de `/admin/site`, con
permiso `appearance:write`. Reutiliza `ProSiteStudio` limitado a las
pestañas `branding` y `appearance` (props `allowedTabs` y `basePath`);
`/admin/site` queda para contenido, secciones, catálogo, SEO y navegación
(branding sigue también allí). El menú tiene la entrada «Apariencia» bajo
«Sitio web», gated por `appearance:write`.

Nota de guardado: «Guardar y publicar» publica todo el bundle de ajustes
y además el catálogo, así que también pide `content:write` (ajustes) y
`catalog:write` (catálogo) en sus rutas. Owner y admin tienen los tres;
una cuenta solo con `appearance:write` puede ver y editar la apariencia
en pantalla, pero el guardado le devolverá 403 en el primer paso que no
cubra.

## Crear más administradores

Ya no está pendiente: hay pantalla y ruta (`/admin/usuarios` y
`app/api/admin/users/route.ts`, permiso `users:manage`).

- **Crear**: correo + contraseña (mínimo 8 caracteres) + rol existente.
  La contraseña se guarda con Argon2id (`hashPassword` de
  `lib/passwords.ts`); nunca se devuelve ni se muestra. El rol `owner`
  solo lo asigna un owner. Si aún no hay ningún admin en BD, la ruta
  responde 409 y remite a `scripts/admin-migrate.mjs`: el propietario
  inicial se sigue creando con ese script, no desde el panel.
- **Deshabilitar**: pone `disabledAt` y revoca todas sus sesiones en BD;
  un admin deshabilitado no entra por ninguna vía. No se puede
  deshabilitar la propia cuenta ni el último owner habilitado.
- **Rehabilitar**: limpia `disabledAt`.
- Cada alta, baja y rehabilitación deja un evento en `AdminAudit`
  (`admin.user_created`, `admin.user_disabled`, `admin.user_enabled`).
  La lista nunca incluye `passwordHash` ni secretos TOTP.
- El alta asigna `mfaRequired` en `true` por defecto (así está el
  modelo); el enrolamiento MFA llega en un tramo posterior.

## Clientes (better-auth): rehash pendiente y hueco del reset

`lib/customer-auth.ts` configura `emailAndPassword.password.hash/verify`
con la lógica dual de `lib/passwords.ts`: las cuentas nuevas y los cambios
de contraseña ya usan Argon2id; las cuentas con hash scrypt heredado
siguen entrando con la verificación dual.

**Rehash oportunista de clientes: pendiente.** Se investigó en
`node_modules/better-auth/dist/` (`context/create-context.mjs`,
`api/routes/sign-in.mjs`, `api/routes/update-user.mjs`): better-auth llama
a `verify` solo con `{hash, password}`, sin `userId` ni sesión. La vía de
buscar la cuenta por su hash en `db.account` y reescribirla dentro de
`verify` se descartó por insegura y frágil:

- `verify` es un verificador puro que better-auth también invoca fuera del
  login (cambio de contraseña, `/verify-password`); un efecto de escritura
  ahí correría fuera de la transacción del cambio de contraseña y podría
  pisar el hash nuevo.
- Usar el hash como clave de búsqueda de la cuenta es frágil y filtra
  información por temporización.

El rehash de clientes solo puede hacerse con la contraseña en claro en la
mano, es decir, en el momento del login. La vía limpia es un hook de
sign-in (o un endpoint propio) en un tramo posterior, no un script: ningún
script puede rehashear sin conocer las contraseñas. Hasta entonces, la
verificación dual mantiene los logins scrypt funcionando.

**Cambio de contraseña de cliente: revoca las demás sesiones.** La UI ya
pasa `revokeOtherSessions: true` (`components/account/AccountForms.tsx`) y
better-auth lo cumple (`deleteUserSessions` + sesión nueva en
`api/routes/update-user.mjs`). El cambio de contraseña, por tanto, cierra
todas las sesiones excepto la actual.

**Hueco conocido: el reset de contraseña NO revoca sesiones.**
`resetPassword` (`api/routes/password.mjs`) solo reescribe la contraseña
de la credencial; las sesiones existentes del usuario siguen válidas hasta
caducar (14 días). Si una cuenta se recupera tras un compromiso, hay que
cerrar sus sesiones a mano en BD (`Session`, better-auth) hasta que un
tramo posterior lo haga automático.

## Fase 1, tramo C: WebAuthn/Passkeys + MFA (2026-11-18)

Actualización: el párrafo "Hueco conocido: el reset de contraseña NO
revoca sesiones" de más arriba queda SUPERSEDO por el punto 4. El resto
del documento sigue vigente.

### 1. Passkeys del administrador (protocolo propio, `@simplewebauthn/server` 13.3.2)

- Almacén: `PasskeyCredential` (tramo B), `ownerType: "admin"`,
  `ownerId` = id de `AdminUser` o `env:<correo>` para el admin por entorno
  (`adminOwnerId` en `lib/webauthn.ts`). La clave pública se guarda en
  base64url y el contador se actualiza en cada uso.
- Rutas: `POST /api/admin/webauthn/register-options` y `register-verify`
  (con sesión), `auth-options` y `auth-verify` (sin sesión: login con
  passkey, que crea `AdminSession` sin pedir contraseña — la passkey ES el
  factor MFA). Página: `/admin/seguridad`.
- Retos: de un solo uso, guardados EN BD (`WebauthnChallenge`, 5 min de
  vida, migración `20261118020000_webauthn_challenges`). La memoria del
  proceso NO vale en serverless: cada instancia vería solo sus retos. El
  consumo es un `deleteMany` atómico con guarda de expiración; reutilizar
  un reto se rechaza.
- Contador: se rechaza si no avanza o si desaparece (guardado > 0, nuevo
  0); un autenticador sin contador devuelve siempre 0 y se acepta.
  Una credencial registrada por otro propietario no se puede robar con un
  re-registro.
- RP: `WEBAUTHN_RP_ID` (por defecto, el host de `BETTER_AUTH_URL`),
  `WEBAUTHN_RP_NAME` (por defecto `CaluServers`), `WEBAUTHN_ORIGIN` (por
  defecto `BETTER_AUTH_URL`). El RP ID definitivo es el dominio de
  producción: las passkeys no valen en otro dominio.
- `hasPasskeyEnrolled(ownerType, ownerId)` (`lib/totp.ts`) ya consulta la
  BD; el login la usa con `("admin", ownerId)`.

### 2. Passkeys del cliente (plugin oficial `@better-auth/passkey` 1.7.18)

- El plugin NO viene en el paquete `better-auth` 1.7.18: es el paquete
  aparte `@better-auth/passkey` (misma versión que `better-auth`, para
  que los peers encajen; no se subió `better-auth`). Se importa de
  `@better-auth/passkey` (servidor) y `@better-auth/passkey/client`.
- El plugin exige SU PROPIO almacén: tabla `passkey` (modelo `Passkey`),
  distinta de `PasskeyCredential`, que es solo del admin. No se duplicó
  el protocolo a mano. Su reto vive en la cookie `better-auth-passkey`
  del plugin, no en `WebauthnChallenge`. Mismo RP que el admin.
- Cliente: `customerAuthClient.passkey.addPasskey`,
  `signIn.passkey`, `listUserPasskeys`, `deletePasskey`. Página:
  `/cuenta/seguridad`. El botón de entrar con passkey en `/cuenta/entrar`
  queda pendiente (no era parte de este tramo).

### 3. TOTP

- Admin por cuenta: `POST /api/admin/mfa/totp-enrol` en dos pasos (genera
  el secreto, lo muestra con su URL otpauth, y solo lo cifra con
  secret-box — AAD `admin-totp:<ownerId>` — y lo guarda en
  `AdminUser.totpSecretEncrypted` si el código verifica). El login
  prefiere el TOTP de la cuenta al del entorno (`ADMIN_TOTP_SECRET`
  sigue como fallback). El admin por entorno no puede enrolar TOTP por
  cuenta (no tiene fila): debe migrar primero.
- Cliente: plugin `twoFactor` de better-auth, OPCIONAL. Solo se exige 2FA
  al cliente que lo activa y verifica el código (`skipVerificationOnEnable`
  sigue en `false`, el defecto); al activar, el plugin genera códigos de
  respaldo (tabla `twoFactor`). Sin activar, el login no cambia.

### 4. Hueco del reset de contraseña: CERRADO

`better-auth` 1.7.18 ya trae la opción
`emailAndPassword.revokeSessionsOnPasswordReset` (sin hook propio):
`lib/customer-auth.ts` la activa en `true`, así que el reset revoca
todas las sesiones del usuario en la misma transacción que el cambio de
contraseña (`utils/password.mjs`). El cambio de contraseña ya revocaba
las demás sesiones (tramo B); ahora el reset también.

### 5. Códigos de recuperación del administrador

- `POST /api/admin/mfa/recovery-codes`: 10 códigos, solo hash SHA-256 en
  `RecoveryCode`, se muestran UNA sola vez. Regenerar invalida los no
  usados. Consumo atómico (`updateMany` con `usedAt: null`): cada código
  vale una sola vez.
- Un código válido vale como el código TOTP en el login (ambos caminos:
  TOTP de cuenta y del entorno). Son el plan B si se pierde el TOTP o la
  passkey; no sustituyen la contraseña.

### 6. Sesiones y factores

- `/admin/seguridad` lista las sesiones activas del admin con revocar
  (`POST /api/admin/mfa/session-revoke`; la sesión actual no se puede
  revocar desde ahí, se cierra con logout) y `GET /api/admin/mfa/factors`
  resume los factores. La página no está enlazada en el menú del panel
  (el menú no se tocó en este tramo): se entra por URL directa.

### 7. Sin verificar en este tramo

Ceremonia WebAuthn real en navegador (registro y login con passkey con un
autenticador de verdad), RP ID con el dominio definitivo de producción,
flujo de cliente con passkey en un teléfono real, y la activación 2FA del
cliente de punta a punta contra la BD real.

## Desviaciones respecto al plan

- `AdminSession.adminUserId` es **anulable** (`String?`). El plan lo
  listaba sin `?`, pero las sesiones del fallback por entorno no tienen
  `AdminUser` al que apuntar y la clave es `NOT NULL` con FK: sin
  anularla, el login por entorno no podría crear sesión durante la
  ventana de 7 días. Esas sesiones llevan permisos de owner y `userId`
  null en `getAdminSession()`; al migrar el propietario, los logins
  nuevos ya quedan ligados a su `AdminUser`.
- `checkPassword` sigue siendo **síncrono y solo scrypt** (contrato
  heredado, lo exige el test de no-enumeración). La verificación dual
  completa vive en `verifyAdminPassword` (asíncrono), que es lo que usa
  la ruta de login.
- `PasskeyCredential` y `RecoveryCode` solo crean las tablas. El
  enrolamiento y la verificación llegan en tramos posteriores; `totp.ts`
  sigue con `hasPasskeyEnrolled()` devolviendo `false` y el MFA por
  entorno sin cambios.
- Las sesiones caducadas o revocadas quedan en `AdminSession`; la purga
  periódica es trabajo de un tramo posterior.

## Fase 6, frente C: step-up y rotación de claves (2026-11-18)

### Step-up: reautenticación para operaciones peligrosas

`AdminSession.stepUpAt` ya existía en el modelo; este frente lo escribe y
lo exige. La confirmación vale **15 minutos**
(`STEP_UP_MAX_AGE_MINUTES` en `lib/stepup.ts`; el plan decía 10, se dejó
en 15 porque el flujo de confirmar + revisar la operación ya es estrecho).

- **Primitiva** (`lib/stepup.ts`): `requireStepUp(session, { maxAgeMinutes })`
  lanza `StepUpRequiredError` (status 403, código `step-up-required`) si
  `session.stepUpAt` es nulo o caducó. `touchStepUp({ adminUserId })` o
  `touchStepUp({ tokenHash })` pone `stepUpAt = now` en la sesión viva.
- **Ruta** `POST /api/admin/step-up`: exige sesión y vuelve a verificar
  la contraseña con `verifyAdminPassword`. Si el admin tiene TOTP
  enrolado en su cuenta (`AdminUser.totpSecretEncrypted`) o hay secreto
  TOTP en el entorno, el código de 6 dígitos es obligatorio: vale el TOTP
  o un código de recuperación de un solo uso (mismo criterio que el login).
  Sin TOTP en ningún sitio, basta la contraseña. Al acertar marca
  `stepUpAt` en la sesión actual, deja un evento `auth.step_up` en
  `AdminAudit` y devuelve `{ ok: true, stepUpAt, mfaRequired }`. Los
  intentos fallidos cuentan en el mismo limitador que el login (8 en 15
  min por IP); un `step-up` correcto lo limpia.
- **Acciones con step-up** (además de su permiso): `service-terminate`
  (`services:terminate`) y `refund-payment` (`payments:confirm`) en
  `app/api/admin/commerce/route.ts`, y `create` en
  `app/api/admin/users/route.ts` (el alta asigna un rol: es la única vía
  que crea un administrador con permisos). Sin step-up reciente la ruta
  responde 403 con `{ error: "step-up-required", message: "..." }` y no
  toca la base ni el panel. `refund-payment` no tiene hoy ningún botón en
  la UI: queda enforced solo en API hasta que se le ponga uno.
- **UI**: `NoteAction` (`components/admin/CommerceActions.tsx`) muestra
  el formulario de reautenticación dentro del mismo diálogo cuando la
  ruta responde `step-up-required` y, al verificar, reintenta la acción
  con la nota ya escrita. `AdminUsersManager` hace lo mismo al crear un
  administrador.
- **Hueco conocido**: no hay una acción suelta de asignar/quitar roles
  en `app/api/admin/users/route.ts` (solo `create` con rol, `disable` y
  `enable`). Cuando se añada una acción de cambio de roles, debe pasar
  por `requireStepUp` igual que `create`. Deshabilitar/rehabilitar no
  exige step-up hoy: lo decide el dueño si quiere añadirlo.

### Rotación de claves (`scripts/rotate-secrets.mjs`)

Los secretos de los plugins se re-cifran de la clave vieja a la nueva
(secret-box v1, mismo AAD `plugin:<key>:v1`). El script nunca rota sin
`--apply` explícito; por defecto es `--dry-run` y solo lista qué rotaría
(plugin y nombres de campos, nunca valores) y verifica que cada secreto
descifra con la clave actual. Sin `DATABASE_URL` o sin
`SETTINGS_ENCRYPTION_KEY` sale con error y no toca nada. Si un secreto no
descifra, no se rota nada: hay que guardar de nuevo ese secreto en
`/admin/plugins` y repetir.

Procedimiento (orden importante):

```bash
# 1. Genera la clave nueva y guárdala en Vercel (aún sin desplegar).
node scripts/rotate-secrets.mjs --generate-key
# 2. Con la clave vieja (la actual en Vercel) y la nueva, rota en BD.
SETTINGS_ENCRYPTION_KEY=<vieja> NEW_SETTINGS_ENCRYPTION_KEY=<nueva> \
  DATABASE_URL=... node scripts/rotate-secrets.mjs --apply
# 3. Despliega con la SETTINGS_ENCRYPTION_KEY nueva en Vercel.
```

`AUTH_SECRET` **no** se rota con este script: cambiarlo invalida todas
las sesiones y cookies y se hace a mano en Vercel, con los admins
avisados de que tendrán que entrar de nuevo. Tampoco se rotan aquí las
claves de los plugins en el proveedor (Stripe, PayPal, Porkbun...): eso es
cambiar el secreto en el proveedor y guardarlo de nuevo en
`/admin/plugins`, que ya actualiza `lastRotatedAt`.
