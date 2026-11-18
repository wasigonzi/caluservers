# Infraestructura recomendada (Fase 6, frente C)

Guía, no implementación: no hay infraestructura real creada ni tocada
desde este frente. Cada punto es algo que el dueño (o quien administre
el despliegue) configura fuera del código, en Cloudflare / Vercel / el
proveedor que elija. Nada de esto se verifica en vivo aquí.

## Acceso al panel de administración

- **`/admin` detrás de Cloudflare Access o de una VPN.** El panel no
  debería estar abierto a todo internet: solo las cuentas de correo del
  equipo (Cloudflare Access, con el dominio de Cloudflare delante) o solo
  desde la VPN de administración. El login con contraseña + MFA sigue
  existiendo, pero no es la única puerta.
- **WAF delante de todo el sitio.** Reglas básicas: limitar intentos de
  login por IP (además del limitador que ya hay en Postgres), bloquear
  patrones de escaneo obvios y rate-limit en `/api/*`. Cloudflare (plan
  gratuito) cubre esto sin tocar el código.
- **Nunca exponer la base de datos.** `DATABASE_URL` solo la conoce
  Vercel (variables de entorno del proyecto). El puerto de Postgres no se
  abre a internet; las migraciones y los scripts (`backup.mjs`,
  `rotate-secrets.mjs`, `admin-migrate.mjs`) se corren desde un equipo de
  confianza o desde el propio despliegue, no desde cualquier IP.

## API privada para nodos

Si algún día hay nodos o workers fuera de Vercel que llamen a CaluServers
(por ejemplo, para provisión o consultas), no se les da la API pública
con una clave compartida sin más:

- Red privada o túnel (Cloudflare Tunnel / Tailscale / WireGuard) entre
  el nodo y el servidor, y autenticación mutua TLS (mTLS): cada nodo
  tiene su propio certificado de cliente y el servidor solo acepta los
  certificados que conoce.
- Cada nodo con el mínimo permiso que necesita (nunca la clave del admin
  ni `AUTH_SECRET`).
- Hoy no hay ningún nodo: esto es el diseño a seguir cuando aparezca el
  primero, no algo que implementar ahora.

## Secretos

- **Solo en Vercel o en variables de entorno del equipo que los usa.**
  `AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH`,
  `STRIPE_SECRET_KEY`, `PAYPAL_CLIENT_SECRET`, claves de age y del
  bucket, `CRON_SECRET`: ninguno vive en el repo, en el código ni en
  respuestas de la API. `.env.example` documenta los nombres, sin valores.
- **Rotación**: `SETTINGS_ENCRYPTION_KEY` se rota con
  `scripts/rotate-secrets.mjs` (ver docs/SEGURIDAD-RBAC.md).
  `AUTH_SECRET` se cambia a mano en Vercel porque invalida sesiones.
- **Respaldo de secretos**: las claves de age y las credenciales del
  bucket se guardan fuera del repo (gestor de contraseñas del dueño). Si
  se pierde la clave privada de age, los respaldos cifrados no se pueden
  restaurar: hay que guardar una copia en un sitio seguro distinto al
  bucket.

## Qué no cubre esta guía

Certificados TLS del dominio (los gestiona Vercel/Cloudflare),
monitorización y alertas de caída del sitio, y copias de los archivos
subidos fuera de la base (adjuntos de tickets, logos en Blob). Esos tres
puntos quedan pendientes de decidir con el dueño.
