# WHM / cPanel — preparación y operación de sólo lectura

En Admin → Conexión WHM indica la URL HTTPS del servidor (puerto 2087), usuario root/reseller y API token WHM. Ninguno de estos datos se conoce de antemano. Sólo el token no basta. No requiere nuevos envs ni servicios: reutiliza la clave de cifrado existente de la aplicación. Si el almacenamiento/clave existente no está disponible, muestra un error explícito, nunca «conectado».

Puedes guardar URL/usuario sin token: el estado es **Pendiente configuración** y no se realizan llamadas. Un token vacío conserva el guardado, sólo si servidor/usuario no cambian. Para otra identidad introduce un token explícito. Guardar no prueba ni activa una conexión exitosa; usa **Probar conexión** después. Las listas del dashboard se consultan manualmente, sin polling.

## Permisos oficiales
WHM → Development → Manage API Tokens. Limita ACL a `list-accts` y `list-pkgs`, respetando los privilegios reales del usuario; un reseller ve sólo sus recursos accesibles. No concedas Everything, cambio de contraseña, creación de sesiones o gestión de tokens. El servidor debe permitir acceso desde el despliegue, con certificado TLS válido para su hostname. No se omite TLS, no se permite IP privada ni se añade un bypass.

Método: `Authorization: whm username:token`, `/json-api/listaccts?api.version=1` y `/json-api/listpkgs?api.version=1`. HTTP 200 no es suficiente: exige `metadata.result === 1`, comando correspondiente y versión 1. Un fallo detiene la secuencia; no hay reintentos automáticos. Los motivos remotos no se publican ni registran en crudo.

## Persistencia y límites
Usa `IntegrationConfig.id=whm` explícito: URL canónica y credenciales cifradas AES-256-GCM, IV aleatorio y AAD propio WHM. El registro `whmcs` anterior permanece intacto e inactivo; endpoints legacy devuelven 410 autenticado. No hay migraciones, borrados ni reutilización de credenciales WHMCS. GET devuelve sólo URL, username, booleanos y estado pendiente/sin verificar, nunca token/ciphertext. El audit sólo registra el evento sin datos de servidor ni secretos.

Red: todos los DNS A/AAAA deben ser públicos; conexión fijada a una dirección validada, identidad TLS/Host original, sin redirecciones. DNS 3s, petición 10s, cuerpo máximo 2MiB, hasta 100 filas mostradas con total de la respuesta completa y aviso de truncamiento. Payload admin máximo 8KiB. Las llamadas sólo salen del POST protegido por sesión admin y Origin mismo sitio. Datos públicos/CMS/Blob/catálogo y enlaces de compra existentes permanecen intactos; WHM no representa pedidos, cobros o facturas.

Sin credenciales reales sólo se ejecutan tests locales con mocks. Esos dobles y un despliegue no demuestran conectividad WHM. Hay que guardar la URL, el usuario y el token, y pulsar Probar conexión desde el admin.

Fuentes oficiales:
- https://api.docs.cpanel.net/whm/tokens
- https://docs.cpanel.net/whm/development/manage-api-tokens-in-whm/
- https://api.docs.cpanel.net/specifications/whm.openapi/account-management/listaccts
- https://api.docs.cpanel.net/openapi/whm/operation/listpkgs/
