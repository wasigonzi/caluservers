# Formularios propios: contacto y abuso

`/contact` y `/abuse` ya no abren el portal externo. El mensaje se envía a esta
aplicación, se guarda en Postgres y se lee en `/admin/mensajes`.

## Qué pasa al enviar

1. El navegador publica en `POST /api/contact` (mismo origen HTTPS; un formulario
   alojado en otro sitio recibe 403).
2. La ruta cuenta el intento en `RequestThrottle`, una fila compartida por todas las
   instancias. Si esa tabla o la base no responden, **se rechaza el mensaje** con 503.
   No hay un modo sin límite.
3. El texto se valida en el servidor: nombre, correo, tema de una lista cerrada,
   dominio o IP en los reportes de abuso, y cuerpo sin `<` ni `>`. Los caracteres de
   control se eliminan antes de validar, así que un `\r\n` no puede inyectar
   cabeceras de correo.
4. El mensaje se guarda con estado `new`.
5. Solo entonces se intenta el aviso por correo. Si falla, el mensaje sigue guardado
   con `delivered = false` y el panel lo indica.

Un fallo de base responde 503 y la interfaz nunca dice que el mensaje se envió.

## Dirección de aviso

Por este orden:

1. El email de contacto de `/admin/site` (`SiteSetting` con clave `contact`).
2. `CONTACT_INBOX`.

Sin ninguno de los dos, el mensaje se guarda y no sale ningún correo. Sin `SMTP_URL`
tampoco sale, aunque haya dirección.

El aviso lleva `Reply-To` con el correo del cliente, así que se responde desde el
gestor de correo de siempre. Esta web no envía respuestas.

## Privacidad

De la conexión del remitente no se guarda la IP, sino un HMAC con `AUTH_SECRET`
(`clientKey`). Sirve para ver abuso repetido sin almacenar la dirección.

## Panel

`/admin/mensajes` con tres bandejas: nuevos, leídos y archivados. Archivar no borra:
el histórico se conserva.

## Límites

- 20 envíos por ventana de 30 minutos y conexión.
- Cuerpo máximo de 4000 caracteres; petición máxima de 16 KiB.
- Texto plano. Los enlaces se pegan como texto.
