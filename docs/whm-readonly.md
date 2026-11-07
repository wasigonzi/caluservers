# WHM / cPanel — lectura automática y gestión confirmada

## Configuración existente
Admin → Conexión WHM mantiene URL HTTPS:2087, usuario y API token cifrados con la clave existente. Esta ampliación NO cambia configuración, token, envs ni esquema. GET nunca devuelve token/ciphertext. El registro WHMCS anterior queda intacto/inactivo. Si falta configuración o almacenamiento, muestra el estado real sin inventar conexión.

## Lectura automática
Cuentas y Paquetes cargan al montar y programan la siguiente lectura45s después de terminar la anterior. Sólo pestaña visible/online. Hay AbortController, cleanup de timers/listeners y exclusión de peticiones solapadas por operación. Se conservan los últimos datos verificados mientras se actualizan; fallo/pausa muestra badge stale y hora Halifax. Espera tras fallos90/180/300s, reiniciada tras éxito; botón manual opcional. Cuentas y paquetes se leen de forma independiente: un fallo de permisos de paquetes no oculta las cuentas. Abrir un modal pausa el refresco y al cerrarlo vuelve a leer. No existen cron ni procesos de fondo.

## Gestión desde el admin
- Cuentas: `createacct`, `suspendacct`, `unsuspendacct`, `changepackage`.
- Paquetes: `addpkg`, `editpkg` con disco/transferencia MB y cantidades de correo/bases de datos. Números positivos o `unlimited` explícito; límites locales y restricciones adicionales de WHM. Nombre inmutable. Un paquete nuevo no habilita shell ni IP dedicada.
- No hay terminate/remove/delete, borrado de paquetes, password-reset, facturación, envío de emails desde la web ni sincronización/borrado de filas de la BD.
- Cada operación abre un modal nativo accesible, muestra alcance/efectos, exige escribir el recurso exacto y aceptar posibles notificaciones propias de WHM. No hay petición de mutación al abrir/editar el formulario. Suspender requiere motivo; la acción disponible depende del estado leído. Paquetes del selector son lecturas reales, no nombres fabricados.
- Cuenta nueva exige contraseña explícita16–128 ASCII imprimibles con3 de4 clases, sin usuario incluido. La contraseña se limpia inmediatamente al enviar y al cerrar, incluso si falla; nunca se devuelve, guarda en auditoría o coloca en URL. No se genera ni envía una contraseña.
- WHM puede emitir notificaciones propias (alta/suspensión/reactivación/cambio de paquete) según Contact Manager. `createacct` no documenta una bandera de supresión global; no se inventa una ni se cambia configuración del servidor. No se envía contactemail ni se crean mensajes desde la web.

## Backend y permisos
POST administrativo `/api/admin/whm/manage`: sesión y Origin del mismo sitio ANTES de cuerpo, almacenamiento o red. Esquema estricto, acciones fijas, confirmación exacta, sin URL/endpoint/hostname de cliente. Conexión obtenida internamente de la configuración cifrada actual. Preflight vuelve a leer cuentas/paquetes accesibles y estado antes del cambio; confirma existencia del paquete y rechaza estados obsoletos. Listas limitadas a100 filas; los recursos fuera del límite requieren WHM nativo hasta añadir paginación.

Permisos de lectura: `list-accts`, `list-pkgs`. Gestión: según función/servidor, `create-acct`, `suspend-acct`, `upgrade-account`, `create-pkg`, `edit-pkg` y ACL de recursos ilimitados si se solicita. La UI NO afirma que un token posea esos permisos: WHM es la autoridad y valida cada llamada. No se consulta/exporta el token ni se eleva ACL, concede Everything o crea un token. Restricciones de reseller/permisos de mutación no se han probado en servidor real. Rechazos muestran explicación segura de permisos/límites/validación, nunca metadata.reason crudo.

Para `editpkg`, un `getpkginfo` inmediatamente anterior preserva tema, featurelist, idioma, shell/IP/CGI/digest y otras cuotas no editadas, evitando defaults destructivos. Extensiones/opciones desconocidas o valores no conservables bloquean la edición ANTES del POST; usa WHM nativo para esos paquetes. WHM puede aplicar la edición a TODAS las cuentas del plan y no permite renombrarlo. Una baja/recreación concurrente fuera del admin no puede bloquearse atómicamente con esta API.

Se usa POST form-urlencoded para mutaciones, siempre HTTPS/TLS verificado y token en Authorization; contraseña sólo cuerpo. Todas las DNS A/AAAA deben ser públicas y la conexión queda fijada a una IP validada con Host/TLS originales; sin redirects ni retries de mutación. Lecturas: DNS3s/HTTPS10s; escrituras45s, ruta120s; cuerpo upstream2MiB y payload admin8KiB. HTTP200 NO basta: requiere metadata.result1, command exacto y version1. Respuesta al navegador sólo confirmación segura/acción/recurso; descarta output/raw incluso si contiene contraseñas.

## Auditoría y resultados inciertos
AdminAudit existente: actor `configured-admin` (identidad única del sistema actual), acción fija, recurso validado y outcome started/confirmed/not-confirmed/uncertain. Nunca cuerpo, dominio, motivo, contraseña, token, host ni error crudo. Sin registro inicial no se despacha una operación; si falla el registro final tras éxito, responde éxito con aviso para NO repetir. Fallo de red/timeout/JSON después del POST es incierto, no un falso fracaso seguro. La UI bloquea reenvío y pide cerrar/leer estado; no hay reintentos automáticos ni garantía de idempotencia distribuida.

## Validación y revisión
Tests sólo con reloj, navegador, BD, DNS y HTTPS simulados; canaries etiquetados locales. No se han leído credenciales ni ejecutado mutaciones reales ni guardado configuración ficticia. Browser: revisar autoload, suspensión según estado, formularios/confirmaciones y cancelación, sin confirmar cambios reales durante evaluación. E2E real de alta/suspensión/edición requiere autorización posterior específica sobre recursos concretos; lectura existente no prueba permisos de gestión.

Fuentes oficiales:
- https://api.docs.cpanel.net/whm/tokens
- https://docs.cpanel.net/whm/development/manage-api-tokens-in-whm/
- https://api.docs.cpanel.net/specifications/whm.openapi/account-creation/accounts-createacct
- https://api.docs.cpanel.net/specifications/whm.openapi/suspensions/accounts-suspendacct
- https://api.docs.cpanel.net/specifications/whm.openapi/account-management/accounts-changepackage
- https://api.docs.cpanel.net/specifications/whm.openapi/hosting-plans/packages-addpkg
- https://api.docs.cpanel.net/specifications/whm.openapi/hosting-plans/packages-editpkg
- https://api.docs.cpanel.net/specifications/whm.openapi/hosting-plans/packages-getpkginfo
- https://docs.cpanel.net/whm/server-contacts/contact-manager/132/
- POST form encoding también ejemplificado por CpanelInc/xmlapi-php (obsoleto): https://github.com/CpanelInc/xmlapi-php/blob/master/xmlapi.php . NO se copia su TLS inseguro, auth antigua, debug o errores con secretos; se mantiene transporte nativo seguro actual y WHM API1/token.
