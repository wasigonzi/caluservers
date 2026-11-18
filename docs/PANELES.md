# Paneles de hosting: Plesk y DirectAdmin (Fase 4)

CaluServers puede crear, suspender, reactivar y borrar cuentas de hosting en
un panel externo, además de listar cuentas y planes, a través de la interfaz
`ControlPanel` (`lib/plugin-types.ts`). Esta página documenta lo que se
verificó en la documentación oficial, cómo se configura cada panel y cómo se
hace la primera prueba real. **Nada de lo de aquí se probó en vivo**: no hay
servidores Plesk ni DirectAdmin del proyecto; todo el código se verificó con
transporte falso y fixtures de test.

## Qué paneles hay y qué hace cada uno

| Panel | Clave | Adaptador | Estado |
| --- | --- | --- | --- |
| Plesk | `plesk` | `lib/plesk.ts` (`pleskPanel`) | Implementado, sin probar en vivo |
| DirectAdmin | `directadmin` | `lib/directadmin.ts` (`directAdminPanel`) | Implementado, sin probar en vivo |
| WHM (cPanel) | `whm` | `lib/whm-panel.ts` (frente A) | Fuera de este frente |

Los dos manifiestos están en `lib/plugins.ts` (`kind: "panel"`), **desactivados
por defecto**. Además hay un doble cerrojo: el adaptador exige
`PLESK_ENABLED=true` o `DIRECTADMIN_ENABLED=true` en el entorno **y** el
plugin activo en la base de datos **y** los secretos guardados. Sin cualquiera
de las tres cosas, cada operación falla con `unconfigured` (HTTP 503) y no se
hace ninguna llamada. Nunca se simula nada.

> **Siembra de las filas Plugin.** `listPlugins` solo lee filas de la tabla
> `Plugin`, así que la interfaz de administración no muestra Plesk ni
> DirectAdmin hasta sembrarlas desactivadas (el patrón de las Fases 2 y 3 fue
> una migración que sembraba los plugins nuevos desactivados). El esquema es
> del frente A; cuando la migración exista, algo como:
>
> ```sql
> INSERT INTO "Plugin" ("id", "key", "kind", "label", "enabled", "updatedAt")
> VALUES
>   ('plugin_plesk', 'plesk', 'panel', 'Plesk', false, CURRENT_TIMESTAMP),
>   ('plugin_directadmin', 'directadmin', 'panel', 'DirectAdmin', false, CURRENT_TIMESTAMP)
> ON CONFLICT ("key") DO NOTHING;
> ```
>
> Es el mismo patrón que usaron las migraciones de las Fases 2 y 3 para
> sembrar los demás plugins desactivados.

## Alta automática por panel (`provisionService`, Fase 5)

El hueco de la Fase 4 está cerrado: `provisionService`
(`lib/whm-provision.ts`) ya no rechaza los servicios que no son WHM, sino
que resuelve el adaptador con `getControlPanel(service.panelKey ?? "whm")`
(`lib/panels.ts`) y llama a `createAccount` con los mismos datos que el
alta WHM (dominio, usuario derivado, contraseña generada y cifrada,
paquete/plan, correo). El camino WHM no cambió: sigue siendo `createacct`
directo, con la adopción por `listaccts` si la respuesta se pierde.

### Lo que es igual en los tres paneles

- El usuario es el determinista de siempre (`cpanelUsername`, 8 caracteres,
  empieza por letra): un reintento usa el mismo nombre y no crea dos
  cuentas. Encaja en la regla de DirectAdmin (4–8 caracteres alfanuméricos
  en minúsculas).
- La contraseña inicial es aleatoria por intento (20 caracteres, 4 clases),
  se cifra con su propio AAD antes de llamar al panel y se guarda en
  `cpanelPasswordEncrypted`; nunca va en claro a base ni a logs. Si el alta
  se reintenta tras un fallo, se genera otra nueva.
- El cerrojo es el mismo (`status = "provisioning"`, solo una llamada lo
  toma; `provisionAttempts` cuenta los intentos).
- Si el panel falla, el pago queda registrado, el servicio vuelve a
  `pending_provision` con el motivo en `provisionError` (y el evento
  `service.provision_failed` en el diario) y el reintento manual desde el
  admin (acción `provision-service`, que llama a `provisionService`)
  funciona igual. El fallo se devuelve como `ProvisionError` con código
  `upstream` para que la ruta del admin lo muestre con 409.
- Si el alta pudo completarse pero la respuesta se perdió, el reintento
  readopta la cuenta: `findPanelAccount` busca en `listAccounts` del panel
  la cuenta con ese usuario y dominio. En Plesk, además, `createAccount`
  reutiliza el cliente si el login ya existe (errcode 1007).
- El correo con las credenciales es el mismo; solo cambia la etiqueta del
  usuario («Usuario Plesk:» / «Usuario DirectAdmin:» en vez de «Usuario
  cPanel:») y la nota del servicio («Cuenta Plesk … creada para …»).
- `maybeAutoProvision` (el alta tras un cobro) también distingue el panel:
  en Plesk/DirectAdmin basta la activación y el paquete/plan del servicio;
  no hace falta nada de WHM. El doble cerrojo del panel se comprueba al
  intentar el alta: si falta, queda como fallo visible, no como salto.

### Lo que cambia por panel

- **Paquete/plan:** en Plesk y DirectAdmin solo vale la entrada explícita
  del mapa por plan (`packageByPlan[planId]`). El paquete WHM por defecto
  (`packageName`) NO se reutiliza como nombre de plan de Plesk ni de
  paquete de DirectAdmin: sin entrada explícita el alta falla con código
  `package` antes de llamar al panel.
- **`cpanelUser` es solo de WHM:** en Plesk/DirectAdmin el usuario queda
  solo en `panelAccountId`. Un servicio con `cpanelUser` o `panelAccountId`
  se considera ya dado de alta y no se vuelve a crear.
- **Panel «none» o clave desconocida:** `ProvisionError` con código
  `panel`, antes del cerrojo y sin llamar a nada. Hay que darlo de alta a
  mano en su panel.
- **Doble cerrojo:** sin `PLESK_ENABLED=true` / `DIRECTADMIN_ENABLED=true`
  en el entorno, sin el plugin activo o sin secretos guardados, el
  adaptador lanza `unconfigured` antes de cualquier llamada HTTP; el alta
  queda como fallo visible con ese motivo en `provisionError`.

### Limitaciones de cada adaptador en el alta

- **Plesk:** el nombre del plan se envía tal cual como `plan-name` en
  `webspace` ADD. Si ese plan no existe en Plesk, el alta falla (código
  `upstream` con el `errcode` de Plesk); qué responde exactamente el
  servidor ante un plan inexistente sigue sin verificarse (ver «Plesk —
  sin verificar»). Si la suscripción falla después de crear el cliente,
  el cliente queda creado en Plesk (no se borra solo): el reintento lo
  reutiliza (errcode 1007) y solo reintenta la suscripción.
- **DirectAdmin:** el paquete se envía tal cual en `CMD_API_ACCOUNT_USER`.
  Si ese paquete no existe, DirectAdmin responde `error=1` y el alta falla
  con `upstream`, sin crear nada. El cambio de paquete sigue sin
  soportarse (`changePackage` devuelve 501 honesto): el alta solo crea.
- **Ambos:** la adopción tras una respuesta perdida depende de
  `listAccounts` (Plesk: todas las suscripciones; DirectAdmin: todos los
  usuarios con su configuración). Si esa lectura falla, no se adopta nada
  y el fallo queda visible para reintentar a mano.

## Plesk — lo verificado en la documentación oficial

Transporte: `POST https://<host>:8443/enterprise/control/agent.php` con
`Content-Type: text/xml`. Autenticación con cabeceras `HTTP_AUTH_LOGIN` /
`HTTP_AUTH_PASSWD`, o cabecera `KEY` con una clave secreta. La clave secreta
está ligada a una IP de origen, y desde Vercel la IP de salida varía, así que
el modo recomendado es login/contraseña. La versión de paquete usada es
`1.6.7.0`; el foro de Plesk avisa que Obsidian 18.0.82 deprecó las versiones
anteriores a la 1.6.9.1.

Fuentes:

- Crear una suscripción: `https://docs.plesk.com/en-US/onyx/api-rpc/33892/`
- Crear cuentas de cliente:
  `https://doc.plesk.com/en-US/onyx/api-rpc/about-xml-api/reference/managing-customer-accounts.28788/`
  y `creating-customer-accounts.28789/`
- Obtener información de cuentas de cliente:
  `.../getting-information-about-customer-accounts.28790/`
- Borrar cuentas de cliente:
  `.../deleting-customer-accounts.28791/`
- Gestionar suscripciones (Obsidian):
  `https://doc.plesk.com/en-US/obsidian/api-rpc/about-xml-api/reference/managing-subscriptions.33852/`
  y `setting-subscription-parameters.33907/`,
  `getting-information-about-subscriptions.33899/`,
  `switching-a-subscription-to-a-different-service-plan.66391/`
- Gestionar planes de servicio:
  `https://doc.plesk.com/en-US/onyx/api-rpc/about-xml-api/reference/managing-service-plans.32891/`
  y `getting-information-on-service-plans.32915/`, `available-filters.32907/`
- Enviar paquetes de petición:
  `https://docs.plesk.com/en-US/onyx/api-rpc/about-xml-api/creating-client-software/sending-request-packets.28727/`
- Claves secretas (cabecera `KEY`):
  `https://docs.plesk.com/en-US/obsidian/api-rpc/37121/`
- Cabeceras `HTTP_AUTH_*`:
  `https://support.plesk.com/hc/en-us/articles/12377670069655`
- Suspender una suscripción vía API (ejemplo de `SET status 16`):
  `https://talk.plesk.com/threads/subscription-suspend-via-api.334606/`

### Operaciones de Plesk usadas

| Operación de `ControlPanel` | Llamada real a Plesk |
| --- | --- |
| `createAccount` | `<customer><add>` con `gen_info` (cname, pname, login, passwd, status 0, email). Si el login ya existe (errcode 1007), se reutiliza ese cliente. Después `<webspace><add>` con `gen_setup` (name, owner-id, htype `vrt_hst`, **`ip_address` obligatoria**, status 0) y hosting `vrt_hst` con `ftp_login`/`ftp_password` y `plan-name` opcional. |
| `suspendAccount` | `<webspace><get>` de las suscripciones del cliente, luego `<webspace><set>` con `values/gen_setup/status` = **16** en cada una. El login del cliente sigue activo: la suspensión es de la suscripción. |
| `unsuspendAccount` | Igual, con status = **0**. |
| `terminateAccount` | `<customer><del>` por id o por login. **Borra el cliente y TODAS sus suscripciones y dominios.** |
| `changePackage` | `<service-plan><get>` para resolver el nombre del plan a su `guid`, y `<webspace><set><switch-subscription>` con `plan-guid` en cada suscripción del cliente. El cambio de plan **no acepta el nombre del plan**, solo el GUID. |
| `listAccounts` | `<customer><get>` con filtro vacío y dataset `gen_info` (name, status, owner-id, owner-login). |
| `listPackages` | `<service-plan><get>` con filtro vacío y `owner-all` (id, name, guid). |

### Detalles que importan

- `customer` ADD con un login duplicado devuelve **errcode 1007**; el
  adaptador lo trata como "el cliente ya existe" y lo reutiliza en vez de
  fallar.
- Status de suscripción (`webspace` SET): **0 activo, 16 desactivada por el
  administrador, 32 por el reseller, 64 por el cliente**. En la lectura
  también puede aparecer 4 (backup/restore en curso) o 256 (expirada).
- La **IP de alta es obligatoria** en `webspace` ADD y sale de la
  configuración del plugin (`ipAddress`); sin ella, `createAccount` falla con
  `invalid` antes de llamar al servidor.
- Errores: el adaptador solo expone el `errcode` numérico en el mensaje
  (ej. `Plesk no completó la operación (código 1013).`); el `errtext` del
  servidor nunca sale.
- El XML se analiza con un analizador mínimo propio en `lib/plesk.ts`
  (elementos, texto, entidades, CDATA, comentarios, etiquetas
  autocontenidas; los atributos se ignoran).

### Plesk — sin verificar

- Los valores de status de `customer` SET (no se usa: la suspensión es por
  suscripción).
- El operador `<ip>` para listar las IPs del servidor (no se usa: la IP es
  configuración del plugin).
- Equivalentes en la REST API v2 (no se usan; todo es API-RPC).
- Qué responde exactamente el servidor ante un `webspace` ADD con un plan
  que no existe, o ante un `switch-subscription` con un GUID inválido.
- Si la versión de paquete 1.6.7.0 sigue aceptada en la versión de Plesk del
  servidor real (Obsidian 18.0.82 deprecó < 1.6.9.1).

## DirectAdmin — lo verificado en la documentación oficial

Transporte: `https://<host>:2222`, autenticación Basic (RFC 7617). Se
recomienda una login key dedicada en vez de la contraseña del admin; el admin
puede impersonar con `admin|usuario`. Todas las llamadas legacy llevan
`?json=yes` para recibir JSON en vez de HTML o url-encoded.

Fuentes:

- API legacy:
  `https://docs.directadmin.com/developer/api/legacy-api.html`
- Ejemplos de la API legacy:
  `https://docs.directadmin.com/developer/api/examples.html`
- Swagger de la API nueva (servidor demo, verificado 2026-11-18):
  `https://demo.directadmin.com:2222/static/swagger.json`

### Operaciones de DirectAdmin usadas

| Operación de `ControlPanel` | Llamada real a DirectAdmin |
| --- | --- |
| `createAccount` | `POST /CMD_API_ACCOUNT_USER?json=yes` con `action=create`, `add=Submit`, `username`, `email`, `passwd`, `passwd2`, `domain`, `package`, `ip`, `notify=no`. Éxito: `error=0`. |
| `suspendAccount` | Primero `GET /CMD_API_SHOW_USER_CONFIG?user=<usuario>` para leer `suspended`; si está activo, `POST /CMD_API_SELECT_USERS` con `location=CMD_SELECT_USERS`, `suspend=Suspend/Unsuspend`, `select0=<usuario>`. **Suspend/Unsuspend CONMUTA el estado**, por eso se lee antes. |
| `unsuspendAccount` | Igual, solo si `suspended` es `yes`. Si ya está activo, no se llama. |
| `terminateAccount` | `POST /CMD_API_SELECT_USERS` con `confirmed=Confirm`, `delete=yes`, `select0=<usuario>`. |
| `listAccounts` | `GET /CMD_API_SHOW_ALL_USERS?json=yes` y luego `CMD_API_SHOW_USER_CONFIG` por usuario (domain, suspended, account ON/OFF, package, ip). Un usuario cuya config no se lee se omite sin tumbar el listado. |
| `listPackages` | `GET /CMD_API_PACKAGES_USER?json=yes` (la respuesta es `list[]=nombre&list[]=nombre`). |
| `changePackage` | **No soportado** (ver abajo). |

### Detalles que importan

- El nombre de usuario debe tener **de 4 a 8 caracteres alfanuméricos en
  minúsculas**; el adaptador lo valida antes de llamar.
- `notify=no`: los avisos al cliente los manda CaluServers, no DirectAdmin.
- La suspensión es una conmutación: el adaptador **siempre lee el estado
  antes** y no llama si ya está en el estado pedido.
- El éxito documentado de `CMD_API_SELECT_USERS` es una redirección
  `Location`. El adaptador acepta las tres formas: redirección 3xx a la
  location pedida (`CMD_SELECT_USERS`), `error=0` en JSON o en url-encoded.
- La IP de alta sale de la configuración del plugin (`ipAddress`); sin ella,
  `createAccount` falla con `invalid` antes de llamar al servidor.

### DirectAdmin — no soportado

- **`changePackage` devuelve un error honesto 501 (`not-supported`).** La
  documentación oficial solo documenta `CMD_API_MODIFY_USER` con
  `action=customize`, que **reescribe TODOS los límites** y no tiene campo
  `package` documentado: enviarlo apagaría opciones que no se envíen. La
  acción `action=package` solo aparece en código viejo de foros y en módulos
  WHMCS antiguos, no en la documentación oficial actual, así que no se usa.

### DirectAdmin — sin verificar

- La forma exacta del éxito de `CMD_API_SELECT_USERS` con `?json=yes`
  (redirección frente a JSON): el adaptador acepta ambas, pero en un servidor
  real solo se verá una.
- La API nueva (`/api/users/...`) **solo tiene lecturas de usuarios**
  (`/api/users/list`, `/api/users/{username}/config`, `/login-history`,
  `/usage`): no hay crear, suspender ni borrar usuarios, por eso se usa la
  legacy para todo lo que escribe.
- `CMD_API_PACKAGES_RESELLER` y `CMD_API_SHOW_RESELLER_IPS` existen en la
  documentación pero no se usan (los paquetes se leen como usuario y la IP
  es configuración).

## Transporte y seguridad (común a ambos)

- Todas las llamadas pasan por `lib/outbound.ts` (`requestText`, añadido en
  la Fase 4): solo `https`, host exacto en `allowHosts` (el host de la URL
  configurada), DNS resuelto y fijado a una IP pública, sin redirecciones
  automáticas, TLS verificado (**sin bypass de certificados autofirmados:
  el panel debe tener un certificado TLS válido y resolver a IP pública**),
  timeout de 10 s y límite de cuerpo de 512 KB (2 MB en listados).
- Errores con códigos fijos en español y sin filtrar el cuerpo crudo del
  servidor: `unconfigured` (503, sin plugin activo o sin credenciales),
  `invalid` (400, datos o configuración inválidos), `not-supported` (501),
  `upstream` (502, el panel respondió con error o de forma inesperada).

## Configuración paso a paso

### Plesk

1. En el servidor Plesk, crear (o elegir) el usuario administrador que usará
   CaluServers. Si se usa clave secreta en vez de login/contraseña, crearla
   en Plesk y anotar para qué IP de origen vale (desde Vercel la IP de
   salida varía: preferir login/contraseña).
2. Anotar la URL del panel, por ejemplo `https://plesk.ejemplo.com:8443`, y
   la **IP compartida** que usarán las altas (`ipAddress`).
3. En CaluServers, sembrar la fila del plugin (ver arriba) o, si ya existe,
   abrirla en **Admin → Plugins → Plesk**.
4. Configurar: `url` (obligatoria), `mode` (`login` o `secret-key`,
   obligatoria), `ipAddress` (obligatoria en la práctica para crear cuentas).
5. Guardar los secretos: `login` + `password`, o `secretKey` según el modo.
   Se guardan cifrados con `getPluginSecrets` / el cifrado del sistema de
   plugins; nunca se devuelven por la API.
6. Poner `PLESK_ENABLED=true` en el entorno (Vercel) y activar el plugin.
7. Probar con **Admin → Plugins → Plesk → Probar conexión** (ver abajo).

### DirectAdmin

1. En el servidor DirectAdmin, crear una login key dedicada para
   CaluServers (o usar el login del admin; la login key es lo recomendado).
2. Anotar la URL del panel, por ejemplo `https://da.ejemplo.com:2222`, y la
   **IP** que usarán las altas (`ipAddress`).
3. Sembrar la fila del plugin (ver arriba) o abrirla en
   **Admin → Plugins → DirectAdmin**.
4. Configurar: `url` (obligatoria), `ipAddress` (obligatoria en la práctica
   para crear cuentas).
5. Guardar los secretos: `login` + `password`, cifrados como los demás.
6. Poner `DIRECTADMIN_ENABLED=true` en el entorno y activar el plugin.
7. Probar con **Admin → Plugins → DirectAdmin → Probar conexión**.

## Prueba de conexión

`POST /api/admin/plugins` con `{ "action": "test-connection", "key": "plesk" }`
o `"directadmin"`, permiso `settings:write`. Solo hace una lectura y no crea
ni borra nada:

- Plesk: `listPackages` (`<service-plan><get>`). Devuelve
  `{ ok: true, detail: "Conexión correcta: N plan(es) de servicio." }`.
- DirectAdmin: `listPackages` (`GET /CMD_API_PACKAGES_USER`).
  `{ ok: true, detail: "Conexión correcta: N paquete(s)." }`.
- WHM: usa el test existente (`whmRead("test")`).
- Un plugin sin prueba de conexión devuelve **501 honesto**.

Sin plugin activo o sin credenciales devuelve **503**; sin permiso,
**403** sin llamar al panel. La respuesta nunca incluye secretos.

## Primera prueba real (con un servidor de pruebas, sin ejecutar)

1. Levantar un servidor Plesk o DirectAdmin de pruebas (no el de
   producción) con un dominio de prueba y un plan de prueba.
2. Configurar el plugin como arriba, con `PLESK_ENABLED=true` o
   `DIRECTADMIN_ENABLED=true` y el plugin activo.
3. **Probar conexión** desde Admin → Plugins y confirmar que devuelve
   `ok: true` con el número de planes/paquetes del servidor de pruebas.
4. Crear una cuenta de prueba desde CaluServers (dominio de prueba, plan de
   prueba) y comprobar en el panel que existen el cliente/usuario y la
   suscripción/cuenta con ese plan.
5. Suspenderla desde CaluServers y comprobar en el panel que quedó
   suspendida (Plesk: suscripción con status 16; DirectAdmin: usuario con
   `suspended=yes`).
6. Reactivarla y comprobar que vuelve a activa.
7. Cambiarle el plan (solo Plesk) y comprobar el cambio en el panel.
8. Borrarla desde CaluServers y comprobar que desapareció del panel
   (en Plesk, que también desaparecieron sus suscripciones y dominios).
9. Borrar la cuenta de prueba y desactivar el plugin si no se va a usar más.

## Qué queda pendiente del dueño

- **Servidores:** no hay ningún servidor Plesk ni DirectAdmin del proyecto.
  Hace falta al menos uno de pruebas (y luego el de producción) con su URL,
  su IP de alta y un plan de prueba.
- **Credenciales:** login/contraseña (o clave secreta) de Plesk y
  login/contraseña o login key de DirectAdmin. Nadie las ha entregado; no se
  inventaron.
- **Mapeo de paquetes:** qué plan de Plesk (`plan-name` / GUID) y qué paquete
  de DirectAdmin corresponde a cada producto/servicio de CaluServers. El
  mapeo vive en `packageByPlan[planId]` de la configuración de alta
  automática, una entrada explícita por plan; el paquete WHM por defecto
  no se reutiliza en estos paneles. Sin ese mapeo, `createAccount` no sabe
  qué plan pedir y el alta falla con código `package`.
- **Migración de siembra:** sembrar las filas `plesk` y `directadmin`
  desactivadas (ver arriba); el esquema es del frente A.
- **Verificación en vivo:** la primera prueba real de arriba, con un
  servidor de pruebas, todavía no se hizo ni se puede hacer sin lo anterior.
- **Decisión pendiente:** si DirectAdmin necesita `changePackage` algún día,
  habrá que verificar en un servidor real si `action=package` funciona o
  construir el cambio con `action=customize` enviando todos los límites del
  paquete nuevo (peligroso si falta alguno).
