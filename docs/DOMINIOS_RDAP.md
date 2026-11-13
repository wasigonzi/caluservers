# Búsqueda de dominios (RDAP)

`/domains` comprueba la disponibilidad de verdad. No necesita credenciales ni un
contrato con un registrador.

## Cómo

1. El servidor descubre el servidor RDAP de la extensión con el arranque oficial de
   IANA (`https://data.iana.org/rdap/dns.json`), que se guarda en memoria 12 horas.
2. Consulta `GET <servidor>/domain/<dominio>` directamente a ese registro.

Lecturas:

| Respuesta del registro | Resultado |
|---|---|
| 404 | libre |
| 200 | registrado |
| 429 | sin confirmar (el registro limitó las consultas) |
| otro, plazo agotado, red caída | sin confirmar |

**Un fallo nunca se presenta como «libre».** Cuando no hay confirmación, la página lo
dice y ofrece comprobarlo en el portal.

## Límites deliberados

- Solo las extensiones que vende el sitio (`TLDS` en `lib/catalog.ts`). No es un
  proxy RDAP abierto.
- Solo dominios de segundo nivel. Sin subdominios.
- Los nombres con acentos o caracteres no ASCII se convierten a punycode.
- 40 consultas por ventana de 10 minutos y conexión, contadas en `RequestThrottle`.
  Si esa tabla no responde, no se consulta nada: 503.

## Lo que no hace

- No registra dominios ni comprueba precios. El registro sigue en el portal de
  cliente, con el nombre ya puesto en la URL del carrito.
- No consulta WHOIS clásico (puerto 43), solo RDAP sobre https.
- RDAP no está obligado a decir por qué un dominio no está disponible: un nombre
  reservado o bloqueado por el registro se ve como «registrado».
