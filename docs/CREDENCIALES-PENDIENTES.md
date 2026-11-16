# Credenciales pendientes para funcionar de punta a punta en vivo

Lista exacta de lo que falta poner para que un cliente real pueda registrarse,
contratar, pagar en línea y recibir su hosting sin intervención manual. **No
hay valores en este documento**: solo nombres, dónde se pegan y cómo verificar
cada pieza.

Flujo de punta a punta: registro en `/cuenta` → pedido en
`/cuenta/contratar` → factura → pago con PayPal → alta automática en WHM →
cuenta cPanel activa. El seguimiento del pedido es en el panel del cliente
(`/cuenta/facturas/[id]`); no hay ruta `/pedido/[token]`.

Estado en `/admin/configuracion`: muestra cada pieza (moneda, impuestos,
PayPal, correo, base, URL pública, Blob) y botones de prueba donde aplica.

## 1. Base: moneda, impuestos, secretos y URL (variables de entorno en Vercel)

Sin esto no hay pedidos, aunque todo lo demás esté puesto.

| Variable | Dónde | Para qué / cómo se verifica |
|---|---|---|
| `DATABASE_URL` | Vercel → Environment Variables (Production) | La base responde. Verificar: `/admin/configuracion` → «Base de datos: Conectada y al día». |
| `AUTH_SECRET` (≥32 caracteres) | Vercel | Sesiones y HMAC del usuario cPanel. La contraseña inicial ya es aleatoria y se guarda cifrada; `AUTH_SECRET` ya no la deriva. Sin 32 caracteres no se calcula el alta. Verificar: el alta en WHM crea la cuenta. |
| `SETTINGS_ENCRYPTION_KEY` (64 hex) | Vercel | Cifra las credenciales WHM guardadas en el panel. Verificar: guardar la config de WHM en `/admin/settings` sin error. |
| `BETTER_AUTH_SECRET` (≥32 caracteres) | Vercel | Registro e inicio de sesión de clientes. Sin él, el registro responde 503. Verificar: `/admin/configuracion` → «Registro de clientes: Activo». |
| `BETTER_AUTH_URL` | Vercel | URL pública del sitio (p. ej. `https://caluservers.com`). |
| `BILLING_CURRENCY` | Vercel | Código ISO de 3 letras (p. ej. `USD`). Sin ella no se pueden crear pedidos. Verificar: `/admin/configuracion` → «Moneda». |
| `TAX_MODE=none` | Vercel | Solo si el propietario confirma que no hay impuesto. Sin él, la factura queda como proforma no cobrable y no se puede pagar. Verificar: `/admin/configuracion` → «Impuestos». |
| `NEXT_PUBLIC_SITE_URL` | Vercel | URL canónica sin barra final. Obligatoria para el retorno del pago de PayPal, el sitemap y los enlaces de los correos. |

## 2. PayPal: cobro en línea (variables de entorno en Vercel)

Las claves salen de developer.paypal.com → Apps & Credentials, **en el mismo
entorno** que `PAYPAL_ENV`. Sin las cuatro, `/cuenta` no ofrece pago en línea y
el cobro sigue siendo manual y auditado desde `/admin/facturas`. No existe un
modo de prueba que simule un cobro.

| Variable | Dónde | Para qué / cómo se verifica |
|---|---|---|
| `PAYPAL_ENV` | Vercel | `sandbox` o `live`. Empieza en `sandbox` para probar; `live` solo con claves live. |
| `PAYPAL_CLIENT_ID` | Vercel | Client ID de la app de PayPal (mínimo 20 caracteres). |
| `PAYPAL_CLIENT_SECRET` | Vercel | Secret de la misma app (mínimo 20 caracteres). |
| `PAYPAL_WEBHOOK_ID` | Vercel | Id del webhook creado en esa misma app (mínimo 10 caracteres). Sin él, el webhook responde 503 y ningún aviso de PayPal registra cobros. |

**Webhook en developer.paypal.com** (en la misma app y entorno que las claves):

- URL: `https://TU-DOMINIO/api/paypal/webhook`
- Eventos: `PAYMENT.CAPTURE.COMPLETED` y `CHECKOUT.ORDER.COMPLETED`
- Copia su id en `PAYPAL_WEBHOOK_ID`.

**Cómo verificar**: `/admin/configuracion` → «Cobro con PayPal» debe decir
«Activo en modo sandbox/live, con webhook verificado». Luego un pago real en
`sandbox` de punta a punta: pedido → «Pagar con PayPal» → aprobación en PayPal
→ retorno a `/cuenta/pago` → captura → factura pagada. El importe tiene que
coincidir exactamente con la factura; si no, no se registra nada.

**Límites que no cambian con credenciales**: no hay suscripciones ni cobro
recurrente (cada factura se paga una vez) y no hay reembolsos desde el panel.

## 3. Correo saliente SMTP (variables de entorno en Vercel)

| Variable | Dónde | Para qué / cómo se verifica |
|---|---|---|
| `SMTP_URL` | Vercel | URL del servidor SMTP, con usuario y contraseña si los exige (p. ej. `smtps://usuario:contraseña@servidor:puerto`). Sin ella no sale ningún correo en producción. |
| `MAIL_FROM` | Vercel | Remitente que ve el cliente. Sin ella se usa `no-reply@localhost`. |

**Para qué hace falta**: recuperación de contraseña del cliente y avisos
(credenciales del alta en WHM, formularios de contacto y abuso, tickets). Sin
SMTP, el enlace de recuperación nunca llega. **No hace falta para el alta en
WHM**: sin SMTP el alta se hace igual y la contraseña inicial queda visible en
el panel del cliente y en el de administración.

**Cómo verificar**: `/admin/configuracion` → «Correo saliente (SMTP)» debe
decir «Activo» y el botón «Enviar correo de prueba» tiene que llegar. Después,
probar la recuperación de contraseña y el correo de credenciales tras un alta.

## 4. WHM: token de lectura (en `/admin/settings`)

Para el listado de cuentas y paquetes que muestra el panel. El token de
lectura **no** sirve para dar de alta: el transporte de lectura rechaza
cualquier comando que modifique el servidor.

| Pieza | Dónde | Para qué / cómo se verifica |
|---|---|---|
| URL del servidor WHM (`https`, puerto 2087) | `/admin/settings` | Endpoint del servidor. |
| Usuario WHM | `/admin/settings` | Usuario dueño del token. |
| Token API con ACL `listaccts` y `listpkgs` | `/admin/settings` | Solo lectura. Se crea en WHM → Development → Manage API Tokens. No concedas «Everything». |

**Cómo verificar**: en `/admin/settings`, la prueba de conexión y el listado
de cuentas y paquetes responden sin error.

## 5. WHM: alta automática (en `/admin/provision`)

Token **distinto** del de lectura, con ACL `createacct` y `suspendacct` y nada
más. Un ciphertext del token de lectura no se puede reutilizar como token de
escritura.

| Pieza | Dónde | Para qué / cómo se verifica |
|---|---|---|
| URL del servidor WHM (`https`, puerto 2087) | `/admin/provision` | Mismo servidor que la lectura (o el que corresponda). |
| Usuario WHM | `/admin/provision` | Usuario dueño del token de escritura. |
| Token API con ACL `createacct` y `suspendacct` | `/admin/provision` | Crear cuentas y suspenderlas al cancelar un servicio. Se crea en WHM → Development → Manage API Tokens. No concedas «Everything», cambio de contraseñas ni gestión de tokens. |
| Paquete WHM (general o uno por plan de hosting) | `/admin/provision` | Nombre exacto del paquete tal como existe en WHM. La app no crea paquetes: tienen que existir allí. |
| Activar el alta | `/admin/provision` | Interruptor de activación. Viene desactivada. |

**Cómo verificar**: `/admin/provision` debe mostrar el alta como lista
(`ready`): activada, con servidor, token y paquete. Si falta algo, la misma
pantalla lista las piezas que faltan. Luego, un pedido real de hosting con pago
confirmado debe dejar el servicio activo con su usuario cPanel; si el alta
falla, el servicio queda en `pending_provision` con su motivo y el botón
«Dar de alta en WHM ahora» en `/admin/servicios` lo reintenta.

**Al cancelar, la cuenta se suspende en WHM**: cancelar un servicio en el
panel llama a `suspendacct` con el mismo token de escritura. Si la suspensión
no se puede hacer (sin token con esa ACL, o WHM rechaza), la cancelación
sigue quedando registrada y el motivo aparece en `/admin/servicios`, pero la
cuenta sigue activa en el servidor y hay que suspenderla a mano. Sin la ACL
`suspendacct` el alta funciona igual; solo la suspensión al cancelar queda
pendiente de hacerse a mano.

## 6. Imágenes (opcional): Vercel Blob

| Variable | Dónde | Para qué / cómo se verifica |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel | Subida de logos, favicon e imágenes OG desde `/admin/site` (Branding). Se obtiene creando un Blob store **Public** en el proyecto Vercel (Storage → Blob) y conectándolo; luego `vercel env pull`. Sin token, la subida se desactiva y en Branding se pegan URLs https. |

## Resumen: qué sigue pendiente del dueño

1. Decidir `BILLING_CURRENCY` y confirmar `TAX_MODE=none` (o definir impuestos).
2. Crear la app en developer.paypal.com (sandbox primero), su webhook con los dos eventos, y pegar las cuatro variables en Vercel.
3. Contratar o elegir el SMTP y pegar `SMTP_URL` + `MAIL_FROM` en Vercel.
4. Crear en WHM el token de lectura (`listaccts`, `listpkgs`) y el de escritura (`createacct`, `suspendacct`), pegarlos en `/admin/settings` y `/admin/provision`, crear los paquetes WHM que falten y activar el alta.
5. Hacer un pedido real de punta a punta en `sandbox` (registro → pedido → pago → alta) antes de pasar PayPal a `live`.
