# Alta automática en WHM

Crea la cuenta cPanel cuando un pago queda confirmado. **Viene desactivada** y hay
que activarla a mano en `/admin/provision`.

## Por qué hay credenciales aparte

El token de `/admin/settings` es de solo lectura (`list-accts`, `list-pkgs`) y así
se queda: el transporte de lectura rechaza cualquier comando que modifique el
servidor, y hay pruebas que lo verifican.

El alta usa un **segundo token**, con ACL `createacct` y nada más, guardado cifrado
con AES-256-GCM y un AAD propio (`IntegrationConfig("whm-provision")`). Un
ciphertext del token de lectura no se puede reutilizar como token de escritura.

En WHM → Development → Manage API Tokens: crea un token nuevo, limita su ACL a crear
cuentas y no concedas «Everything», cambio de contraseñas ni gestión de tokens.

## Requisitos para que funcione

Todos, o no se llama a WHM:

- Activado en `/admin/provision`.
- Servidor https en el puerto 2087, usuario y token con `createacct`.
- Un paquete WHM: el general, o uno por plan de hosting.
- `SMTP_URL` configurado. La contraseña inicial **no se guarda en la base**: se
  genera, se crea la cuenta y se envía al cliente. Sin forma de entregarla, no se
  da de alta.
- El pedido tiene que declarar un dominio. Los planes de hosting lo piden en
  `/cuenta/contratar`; VPS y dedicados no se dan de alta por aquí.

## Cómo evita cuentas duplicadas

- El usuario cPanel es **determinista** por servicio (HMAC de su id con
  `AUTH_SECRET`): un reintento usa el mismo nombre, así que WHM rechaza el segundo
  intento en lugar de crear otra cuenta.
- `status = "provisioning"` es un cerrojo en base: solo la llamada que consigue
  cambiar la fila de `pending_provision` a `provisioning` continúa.
- `cpanelUser` es único. Si ya existe, el alta no se repite.

## Si falla

El servicio vuelve a `pending_provision` con `provisionError`, un motivo saneado
(código, nunca el texto del servidor ni el token). El cobro **no se deshace**. En
`/admin/servicios` aparece el botón «Dar de alta en WHM ahora» para reintentar.

Si la cuenta se crea pero el correo con la contraseña no sale, el servicio queda
activo y `provisionError` lo dice: restablece la contraseña en WHM y entrégala tú.
No hay reintentos automáticos.

## Red

Mismo endurecimiento que la lectura: solo https al 2087, DNS resuelto a direcciones
públicas, conexión fijada a la dirección validada, identidad TLS del hostname
original, sin redirecciones, sin bypass de TLS, con plazo y tamaño máximo de
respuesta. Los parámetros se validan antes de salir: un nombre raro o un salto de
línea no llega al servidor.

## Lo que no hace

- No suspende, no borra ni modifica cuentas: solo `createacct`.
- No crea paquetes en WHM. El paquete tiene que existir allí.
- No migra ni importa cuentas del portal remoto.
