# Panel de administración

El panel (`/admin`) gestiona el área de clientes propia además del sitio y la conexión WHM.
Todas las páginas exigen la sesión de administrador y todas las escrituras pasan por
`POST /api/admin/commerce`, que comprueba origen y sesión.

## Secciones

| Ruta | Para qué |
| --- | --- |
| `/admin` | Resumen: cobrado este mes, por cobrar, servicios activos, clientes, pendientes, cobros de 6 meses, actividad reciente y estado de la configuración. |
| `/admin/clientes` | Lista con búsqueda por nombre o correo. Cada cliente tiene su ficha con facturas, servicios y tickets. |
| `/admin/facturas` | Pedidos y facturas por estado. Confirmar un cobro manual o anular una factura sin cobro. |
| `/admin/servicios` | Servicios por estado. Alta en WHM (si está lista), alta manual o cancelación. |
| `/admin/tickets` | Tickets por estado y su conversación: responder, cerrar y reabrir. |
| `/admin/mensajes` | Bandeja de los formularios de contacto y abuso. |
| `/admin/actividad` | Diario unificado de `CommerceEvent` y `AdminAudit`. Solo lectura. |

| `/admin/site?seccion=…` | Sitio web: `branding`, `appearance`, `content`, `sections`, `catalog`, `seo`, `nav`. Cada una tiene su entrada en el menú; se publican juntas. |
| `/admin/configuracion` | Estado real de moneda, impuestos, PayPal, correo, acceso, base de datos y WHM, y dónde se cambia cada cosa. Incluye «Enviar correo de prueba» y «Probar conexión». |

Los secretos (claves, contraseñas, tokens) son variables de entorno: Configuración muestra si
están puestos, nunca su valor.

`/admin/comercio` redirige a `/admin/facturas`. Los contadores del menú son los pendientes:
facturas emitidas, servicios pendientes de alta, tickets abiertos y mensajes nuevos.

## Reglas que el panel no se salta

- Confirmar un cobro, anular una factura, marcar un alta manual y cancelar un servicio
  piden una nota de al menos 8 caracteres. Queda en el diario con quién lo hizo.
- Una factura con cobro registrado no se anula. Una factura anulada no se cobra, ni a mano
  ni por PayPal, y su pedido queda como cancelado.
- Cancelar un servicio solo cambia su estado aquí. No suspende ni borra la cuenta en WHM.
- Un ticket cerrado no admite respuestas hasta que se reabre.
- Nada se borra: los estados cambian y el histórico se conserva.

## Avisos por correo de tickets

Con `SMTP_URL` configurado, responder un ticket avisa al cliente, y un ticket nuevo o una
respuesta del cliente avisan a la dirección de contacto del sitio (o `CONTACT_INBOX`).
El correo lleva solo el enlace, no el contenido. Si el aviso no sale, el mensaje ya está
guardado y el panel lo dice.

## Área de cliente

`/cuenta` es un panel propio, con su menú y sus contadores de pendientes:

| Ruta | Para qué |
| --- | --- |
| `/cuenta` | Resumen: servicios activos, importe por pagar, soporte y «qué hacer ahora». |
| `/cuenta/servicios` | Servicios contratados, su estado, usuario cPanel y enlace a cPanel. |
| `/cuenta/facturas` y `/cuenta/facturas/[id]` | Lista y detalle imprimible, con el pago por PayPal y las instrucciones de pago manual. |
| `/cuenta/tickets` y `/cuenta/tickets/[id]` | Soporte: abrir tickets y seguir la conversación. |
| `/cuenta/perfil` | Cambiar el nombre y la contraseña. |

El enlace a cPanel se deduce del servidor WHM configurado en el panel (mismo host, puerto 2083)
y solo aparece en servicios activos con usuario cPanel.

Las instrucciones de pago manual se escriben en Configuración → Negocio y cobros. Se muestran
en las facturas pendientes; el cobro se confirma a mano en Pedidos y facturas.

Cada consulta filtra por el dueño: una factura o un ticket ajeno responde 404.
