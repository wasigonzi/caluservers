# Alta automática en WHM

Crea la cuenta cPanel cuando un pago queda confirmado. **Viene desactivada** y hay
que activarla a mano en `/admin/provision`.

## Por qué hay credenciales aparte

El token de `/admin/settings` es de solo lectura (`list-accts`, `list-pkgs`) y así
se queda: el transporte de lectura rechaza cualquier comando que modifique el
servidor, y hay pruebas que lo verifican.

El alta usa un **segundo token**, con ACL `createacct` y `suspendacct` y nada
más, guardado cifrado con AES-256-GCM y un AAD propio
(`IntegrationConfig("whm-provision")`). Un ciphertext del token de lectura no
se puede reutilizar como token de escritura.

En WHM → Development → Manage API Tokens: crea un token nuevo, limita su ACL
a crear cuentas y suspenderlas, y no concedas «Everything», cambio de
contraseñas ni gestión de tokens. `suspendacct` se usa al cancelar un servicio
desde el panel (ver «Al cancelar»): sin esa ACL la cancelación sigue
funcionando, pero la cuenta queda activa en WHM y el motivo visible en el panel.

## Requisitos para que funcione

Todos, o no se llama a WHM:

- Activado en `/admin/provision`.
- Servidor https en el puerto 2087, usuario y token con `createacct` (y
  `suspendacct` para que la cancelación suspenda la cuenta; ver «Al cancelar»).
- Un paquete WHM: el general, o uno por plan de hosting.
- El pedido tiene que declarar un dominio. Los planes de hosting lo piden en
  `/cuenta/contratar`; VPS y dedicados no se dan de alta por aquí.
- El pago tiene que estar confirmado y el cliente tiene que tener correo
  registrado (es el contacto de la cuenta WHM).

**SMTP no es un requisito.** Desde el commit `36ff3a4` el alta se hace igual
sin `SMTP_URL`: la contraseña inicial se genera aleatoria por servicio, se
guarda CIFRADA en base (AES-256-GCM, AAD propio, nunca en claro ni en logs)
y, si no hay correo, queda visible en el panel del cliente (Mis servicios) y
en el de administración. Con SMTP, además, se envía por correo al cliente. El
estado de `ready` en `/admin/provision` no exige correo: `mailReady` solo se
informa aparte. Los servicios dados de alta antes de este cambio no tienen la
contraseña guardada y muestran «no disponible» hasta que se restablezca su
contraseña en WHM.

## Cuándo se intenta

- **Automática tras el cobro**: al confirmarse un pago se intenta el alta. Si
  la configuración no está lista, no se intenta, pero el salto queda
  registrado (evento `service.provision_skipped` en el diario y el motivo en
  el `provisionError` del servicio, nombrando la pieza que falta).
- **Manual**: en `/admin/servicios` aparece el botón «Dar de alta en WHM ahora»
  para reintentar un servicio pendiente.

## Cómo evita cuentas duplicadas

- El usuario cPanel es **determinista** por servicio (HMAC de su id con
  `AUTH_SECRET`): un reintento usa el mismo nombre, así que WHM rechaza el segundo
  intento en lugar de crear otra cuenta.
- `status = "provisioning"` es un cerrojo en base: solo la llamada que consigue
  cambiar la fila de `pending_provision` a `provisioning` continúa.
- `cpanelUser` es único. Si ya existe, el alta no se repite.
- La contraseña inicial es aleatoria por servicio y se genera una sola vez
  por intento de alta: se cifra ANTES de llamar a WHM y se guarda cifrada.
  Si la respuesta de WHM se pierde y la cuenta se re-adopta, la contraseña
  guardada es la de ese mismo intento — la que recibió WHM —, así que no se
  genera otra. Un reintento tras un fallo genera una contraseña nueva.

## Si falla

El servicio vuelve a `pending_provision` con `provisionError`, un motivo saneado
(código, nunca el texto del servidor ni el token). El cobro **no se deshace**. En
`/admin/servicios` aparece el botón «Dar de alta en WHM ahora» para reintentar.

Si la cuenta se crea pero el correo con la contraseña no sale, el servicio queda
activo y `provisionError` lo dice: restablece la contraseña en WHM y entrégala tú,
o indica al cliente que la vea en su panel. No hay reintentos automáticos.

## Red

Mismo endurecimiento que la lectura: solo https al 2087, DNS resuelto a direcciones
públicas, conexión fijada a la dirección validada, identidad TLS del hostname
original, sin redirecciones, sin bypass de TLS, con plazo y tamaño máximo de
respuesta. Los parámetros se validan antes de salir: un nombre raro o un salto de
línea no llega al servidor.

## Al cancelar

Cancelar un servicio desde `/admin/servicios` lo deja cancelado en base y, si
tiene cuenta cPanel, intenta suspenderla en WHM (`suspendacct`, con el motivo
fijo «Cancelado en CaluServers»). La cancelación nunca se deshace porque la
suspensión falle:

- Si WHM acepta, queda el evento `service.suspended` en el diario.
- Si no hay WHM de escritura configurado o la suspensión falla, el servicio
  sigue cancelado en base y el motivo queda visible al admin en
  `provisionError` (p. ej. «La cuenta cPanel … NO se suspendió en WHM …:
  sigue activa. Suspéndela a mano en WHM.») y en el diario
  (`service.suspend_skipped` o `service.suspend_failed`). La cuenta sigue
  activa en el servidor hasta que se suspenda a mano.
- Sin cuenta cPanel no se intenta nada.

El token de escritura necesita la ACL `suspendacct` además de `createacct`.
La suspensión no se verifica con una segunda lectura: basta la respuesta
`result: 1` de WHM, como en `createacct`. Si la respuesta se pierde (red o
tiempo agotado), el fallo queda registrado aunque WHM pudiera haberla
suspendido: en ese caso el admin lo comprueba en WHM antes de reintentarlo
a mano.

## Lo que no hace

- No borra cuentas: solo `createacct` y `suspendacct`. Borrar una cuenta se
  hace en el servidor.
- No crea paquetes en WHM. El paquete tiene que existir allí.
- No migra ni importa cuentas del portal remoto.
