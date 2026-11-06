import {
  isHttpsUrl,
  isPlainText,
  isSafeHref,
} from "./safe-links";

/** Campo editable tipado del CMS (etiquetas en español). */
export type PageFieldType = "text" | "textarea" | "url" | "path";

export interface PageFieldDef {
  id: string;
  label: string;
  section: string;
  type: PageFieldType;
  max: number;
  /** Valor por defecto = texto actual en código. */
  defaultValue: string;
}

export interface PageDef {
  path: string;
  label: string;
  description: string;
  fields: PageFieldDef[];
}

function f(
  id: string,
  label: string,
  section: string,
  type: PageFieldType,
  max: number,
  defaultValue: string,
): PageFieldDef {
  return { id, label, section, type, max, defaultValue };
}

/** Esquema declarativo: todas las páginas públicas relevantes. */
export const PAGE_DEFS: PageDef[] = [
  {
    path: "/",
    label: "Inicio",
    description: "Home: trust, pasos, FAQ y copy editorial (hero también en SiteSettings).",
    fields: [
      f("statSupportLabel", "Estadística soporte (etiqueta)", "Hero stats", "text", 40, "Apoyo técnico"),
      f("statUptimeLabel", "Estadística uptime (etiqueta)", "Hero stats", "text", 40, "Uptime"),
      f("statSinceLabel", "Estadística desde (etiqueta)", "Hero stats", "text", 40, "Desde"),
      f("statSinceValue", "Estadística desde (valor)", "Hero stats", "text", 20, "2013"),
      f("trust1", "Trust strip 1", "Trust", "text", 60, "Desde 2013"),
      f("trust2", "Trust strip 2", "Trust", "text", 60, "Ryzen 9 9950X"),
      f("trust3", "Trust strip 3", "Trust", "text", 60, "Protección DDoS"),
      f("trust4", "Trust strip 4", "Trust", "text", 80, "Soporte en español e inglés"),
      f("stepsKicker", "Pasos · kicker", "Pasos", "text", 40, "Cómo funciona"),
      f("stepsTitle", "Pasos · título", "Pasos", "text", 80, "De la idea al servidor en tres pasos"),
      f("stepsLead", "Pasos · lead", "Pasos", "textarea", 300, "Sin procesos complicados: eliges, compras en el portal seguro y lo gestionas desde tu panel de cliente."),
      f("step1Title", "Paso 1 título", "Pasos", "text", 60, "Elige tu plan"),
      f("step1Text", "Paso 1 texto", "Pasos", "textarea", 280, "Compara Web Hosting, VPS y Dedicados y escoge la configuración que se ajuste a tu proyecto y tu presupuesto."),
      f("step2Title", "Paso 2 título", "Pasos", "text", 60, "Compra segura en WHMCS"),
      f("step2Text", "Paso 2 texto", "Pasos", "textarea", 280, "El pedido se completa en el portal de cliente de CaluServers, donde también gestionas facturación y renovaciones."),
      f("step3Title", "Paso 3 título", "Pasos", "text", 60, "Gestiónalo desde tu panel"),
      f("step3Text", "Paso 3 texto", "Pasos", "textarea", 280, "Accede a cPanel, a tu VPS con root total o a tu servidor dedicado, y abre tickets de soporte 24/7 cuando lo necesites."),
      f("compareKicker", "Comparativa · kicker", "Comparativa", "text", 40, "Comparativa"),
      f("compareTitle", "Comparativa · título", "Comparativa", "text", 80, "Qué plan encaja contigo"),
      f("compareLead", "Comparativa · lead", "Comparativa", "textarea", 300, "Precios y especificaciones reales del catálogo. Si tu sitio crece, puedes escalar al siguiente nivel."),
      f("locationsKicker", "Ubicaciones · kicker", "Ubicaciones", "text", 40, "Ubicaciones"),
      f("locationsTitle", "Ubicaciones · título", "Ubicaciones", "text", 80, "Servidores cerca de tus usuarios"),
      f("locationsLead", "Ubicaciones · lead", "Ubicaciones", "textarea", 300, "Cuatro ubicaciones activas para tus VPS. Elige la más cercana para minimizar la latencia."),
      f("whyKicker", "Por qué nosotros · kicker", "Infraestructura", "text", 40, "Infraestructura"),
      f("whyTitle", "Por qué nosotros · título", "Infraestructura", "text", 80, "Hecho para permanecer en línea"),
      f("whyLead", "Por qué nosotros · lead", "Infraestructura", "textarea", 300, "Infraestructura moderna con las herramientas y el soporte que necesitas para permanecer en línea."),
      f("faqKicker", "FAQ · kicker", "FAQ", "text", 40, "Preguntas frecuentes"),
      f("faqTitle", "FAQ · título", "FAQ", "text", 80, "Respuestas claras antes de comprar"),
      f("faq1q", "FAQ 1 pregunta", "FAQ", "text", 120, "¿Cómo compro un plan?"),
      f("faq1a", "FAQ 1 respuesta", "FAQ", "textarea", 500, "Elige el plan que te convenga y pulsa «Ordenar». Te lleva al portal de cliente (WHMCS) en client.caluservers.com, donde completas el pedido y el pago de forma segura."),
      f("faq2q", "FAQ 2 pregunta", "FAQ", "text", 120, "¿Cómo recibo soporte si algo falla?"),
      f("faq2a", "FAQ 2 respuesta", "FAQ", "textarea", 500, "El soporte es 24/7 por ticket, en inglés y español. Abre un ticket desde el área de cliente o desde la página de Contacto y el equipo te responde."),
      f("faq3q", "FAQ 3 pregunta", "FAQ", "text", 120, "¿Dónde están ubicados los servidores?"),
      f("faq3a", "FAQ 3 respuesta", "FAQ", "textarea", 500, "Los VPS están disponibles en cuatro ubicaciones de Estados Unidos: Dallas, Los Angeles, New York y Miami. Puedes elegir la más cercana a tus usuarios para minimizar la latencia."),
      f("faq4q", "FAQ 4 pregunta", "FAQ", "text", 120, "¿El VPS incluye acceso root?"),
      f("faq4a", "FAQ 4 respuesta", "FAQ", "textarea", 500, "Sí. Los VPS y los servidores dedicados incluyen acceso root / administrador total: instalas lo que quieras, eliges tu sistema operativo y gestionas el entorno a tu manera."),
      f("faq5q", "FAQ 5 pregunta", "FAQ", "text", 120, "¿Qué sistema operativo puedo elegir?"),
      f("faq5a", "FAQ 5 respuesta", "FAQ", "textarea", 500, "En VPS hay distribuciones Linux disponibles y en los dedicados la selección de sistema operativo es parte de la configuración. También puedes reinstalar y gestionar el servidor desde el panel."),
      f("faq6q", "FAQ 6 pregunta", "FAQ", "text", 120, "¿Qué incluye el Web Hosting?"),
      f("faq6a", "FAQ 6 respuesta", "FAQ", "textarea", 500, "Todos los planes de hosting incluyen cPanel, Softaculous Premium con más de 250 scripts, SSL gratis, cuentas de correo y almacenamiento NVMe SSD. La migración desde cualquier proveedor es gratis."),
    ],
  },
  {
    path: "/web-hosting",
    label: "Web Hosting",
    description: "Héroe, includes y FAQ del hosting compartido.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Web Hosting"),
      f("title", "Título", "Héroe", "text", 100, "Alojamiento que"),
      f("titleAccent", "Título acento", "Héroe", "text", 80, "te mantiene en marcha."),
      f("lead", "Lead", "Héroe", "textarea", 400, "Alojamiento sencillo, seguro y rápido para cada etapa de tu trayectoria en línea."),
      f("popularTag", "Etiqueta plan popular", "Planes", "text", 40, "Más popular"),
      f("defaultTag", "Etiqueta plan", "Planes", "text", 40, "CALUSERVERS"),
      f("quizLead", "Quiz · lead", "Quiz", "textarea", 240, "Sin tecnicismos: responde y te decimos qué plan encaja con lo que necesitas."),
      f("includesKicker", "Incluye · kicker", "Incluye", "text", 40, "Qué incluye"),
      f("includesTitle", "Incluye · título", "Incluye", "text", 80, "Todo lo esencial en cada plan"),
      f("includesLead", "Incluye · lead", "Incluye", "textarea", 300, "Cada plan de Web Hosting trae lo mismo en lo básico: panel, instalador, seguridad y correo."),
      f("faqKicker", "FAQ · kicker", "FAQ", "text", 40, "Preguntas frecuentes"),
      f("faqTitle", "FAQ · título", "FAQ", "text", 80, "Hosting sin sorpresas"),
      f("faq1q", "FAQ 1 pregunta", "FAQ", "text", 120, "¿Incluye cPanel?"),
      f("faq1a", "FAQ 1 respuesta", "FAQ", "textarea", 400, "Todos los planes incluyen cPanel, con Softaculous Premium para instalar más de 250 scripts (incluido WordPress) en un clic."),
      f("faq2q", "FAQ 2 pregunta", "FAQ", "text", 120, "¿El SSL es gratis?"),
      f("faq2a", "FAQ 2 respuesta", "FAQ", "textarea", 400, "Sí. Cada dominio y subdominio recibe un certificado SSL de Let's Encrypt que se renueva solo, sin costo adicional."),
      f("faq3q", "FAQ 3 pregunta", "FAQ", "text", 120, "¿Cuántas cuentas de correo?"),
      f("faq3a", "FAQ 3 respuesta", "FAQ", "textarea", 400, "El plan Calu Starter incluye 100 cuentas de correo; Professional y Business incluyen cuentas ilimitadas."),
      f("faq4q", "FAQ 4 pregunta", "FAQ", "text", 120, "¿Migran mi sitio gratis?"),
      f("faq4a", "FAQ 4 respuesta", "FAQ", "textarea", 400, "Sí. La migración gestionada es gratis: el equipo traslada tu sitio desde cualquier proveedor."),
      f("faq5q", "FAQ 5 pregunta", "FAQ", "text", 120, "¿Puedo subir de plan?"),
      f("faq5a", "FAQ 5 respuesta", "FAQ", "textarea", 400, "Puedes subir de plan dentro del mismo Web Hosting (de Starter a Professional o Business) o escalar a un VPS cuando necesites más recursos y control."),
      f("faq6q", "FAQ 6 pregunta", "FAQ", "text", 120, "¿Hay garantía de devolución?"),
      f("faq6a", "FAQ 6 respuesta", "FAQ", "textarea", 400, "Sí. Si durante tu primer mes sientes que el hosting no es para ti, se reembolsan las tarifas de hosting."),
    ],
  },
  {
    path: "/vps",
    label: "VPS",
    description: "Héroe, ubicaciones, comparativa, hardware y FAQ VPS.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "VPS Hosting"),
      f("title", "Título", "Héroe", "text", 100, "Tu servidor."),
      f("titleAccent", "Título acento", "Héroe", "text", 80, "Tus reglas."),
      f("lead", "Lead", "Héroe", "textarea", 400, "Despliega infraestructura de nueva generación en segundos. Cómputo Ryzen de alta frecuencia, recursos dedicados y uplinks de hasta 20 Gbps en ubicaciones de Europa y EE. UU."),
      f("locTitle", "Ubicaciones · título", "Ubicaciones", "text", 100, "Servidores virtuales"),
      f("locTitleAccent", "Ubicaciones · acento", "Ubicaciones", "text", 40, "dedicados"),
      f("locLead", "Ubicaciones · lead", "Ubicaciones", "textarea", 300, "Selecciona una ubicación cercana a tus usuarios para minimizar la latencia."),
      f("locHeading", "Ubicaciones · encabezado", "Ubicaciones", "text", 80, "Ubicaciones del datacenter"),
      f("locHint", "Ubicaciones · hint", "Ubicaciones", "text", 120, "Los tiempos de ping dependen de tu conexión."),
      f("compareKicker", "Comparativa · kicker", "Comparativa", "text", 60, "Comparativa por ubicación"),
      f("compareTitle", "Comparativa · título", "Comparativa", "text", 80, "El mismo nivel,"),
      f("compareTitleAccent", "Comparativa · acento", "Comparativa", "text", 60, "en cada ciudad."),
      f("compareLead", "Comparativa · lead", "Comparativa", "textarea", 400, "Precios reales del catálogo por nivel y ubicación. Dallas tiene la gama completa; Los Angeles, New York y Miami, una selección."),
      f("compareFineprint", "Comparativa · nota", "Comparativa", "textarea", 300, "Precios por mes. «Consultar» indica que el precio de ese plan no está publicado y se confirma en el portal de cliente."),
      f("whyKicker", "Ryzen · kicker", "Hardware", "text", 60, "Por qué Ryzen 9 9950X"),
      f("whyTitle", "Ryzen · título", "Hardware", "text", 80, "Potencia de escritorio,"),
      f("whyTitleAccent", "Ryzen · acento", "Hardware", "text", 60, "en tu servidor."),
      f("whyLead", "Ryzen · lead", "Hardware", "textarea", 400, "Los VPS de CaluServers corren sobre procesadores AMD Ryzen 9 de alta frecuencia, con recursos dedicados que no se comparten."),
      f("detail1Title", "Detalle 1 título", "Hardware", "text", 80, "Ryzen 9 9950X"),
      f("detail1Text", "Detalle 1 texto", "Hardware", "textarea", 400, "Alta frecuencia por núcleo para aplicaciones, juegos y cargas que dependen de un solo hilo. Recursos de CPU y RAM asignados, nunca compartidos."),
      f("detail2Title", "Detalle 2 título", "Hardware", "text", 80, "DDR5 5600 MHz y NVMe Gen 5"),
      f("detail2Text", "Detalle 2 texto", "Hardware", "textarea", 400, "Memoria DDR5 de alta frecuencia y almacenamiento SSD NVMe Gen 5 en todos los planes, desde 20 GB hasta 960 GB según el nivel."),
      f("detail3Title", "Detalle 3 título", "Hardware", "text", 80, "Red de hasta 20 Gbps"),
      f("detail3Text", "Detalle 3 texto", "Hardware", "textarea", 400, "Uplinks compartidos de 1 a 10 Gbps según el plan y la ubicación, con capacidad de red de hasta 20 Gbps donde la infraestructura lo permite."),
      f("detail4Title", "Detalle 4 título", "Hardware", "text", 80, "IPv4 + IPv6 incluidos"),
      f("detail4Text", "Detalle 4 texto", "Hardware", "textarea", 400, "La dirección IPv4 está incluida en el precio, y en la mayoría de ubicaciones también IPv6, sin costo adicional."),
      f("faqKicker", "FAQ · kicker", "FAQ", "text", 40, "Preguntas frecuentes"),
      f("faqTitle", "FAQ · título", "FAQ", "text", 40, "VPS,"),
      f("faqTitleAccent", "FAQ · acento", "FAQ", "text", 60, "sin letra pequeña."),
      f("faq1q", "FAQ 1 pregunta", "FAQ", "text", 120, "¿Tengo acceso root en mi VPS?"),
      f("faq1a", "FAQ 1 respuesta", "FAQ", "textarea", 400, "Sí. Todos los VPS incluyen acceso root / administrador total para instalar, configurar y administrar tu entorno como quieras."),
      f("faq2q", "FAQ 2 pregunta", "FAQ", "text", 120, "¿Qué sistema operativo puedo instalar?"),
      f("faq2a", "FAQ 2 respuesta", "FAQ", "textarea", 400, "Hay distribuciones Linux disponibles y puedes reinstalar el servidor desde el panel cuando lo necesites. Elige el sistema que mejor se ajuste a tu proyecto."),
      f("faq3q", "FAQ 3 pregunta", "FAQ", "text", 120, "¿Por qué el precio varía según la ubicación?"),
      f("faq3a", "FAQ 3 respuesta", "FAQ", "textarea", 400, "Cada ubicación tiene sus propios planes y precios. Dallas tiene la gama completa (de Starter a Phantom); Los Angeles, New York y Miami tienen una selección de planes con precios propios."),
      f("faq4q", "FAQ 4 pregunta", "FAQ", "text", 120, "¿Qué significa «Consultar» en el VPS Normal de New York?"),
      f("faq4a", "FAQ 4 respuesta", "FAQ", "textarea", 400, "El precio de ese plan no está publicado en el catálogo en este momento. El precio a confirmar se muestra en el portal de cliente al hacer el pedido."),
      f("faq5q", "FAQ 5 pregunta", "FAQ", "text", 120, "¿La red es realmente de 20 Gbps?"),
      f("faq5a", "FAQ 5 respuesta", "FAQ", "textarea", 400, "La capacidad de red llega hasta 20 Gbps donde la ubicación y el plan lo permitan. La velocidad máxima depende del plan, la ubicación y la disponibilidad real de infraestructura."),
      f("faq6q", "FAQ 6 pregunta", "FAQ", "text", 120, "¿La IP está incluida en el precio?"),
      f("faq6a", "FAQ 6 respuesta", "FAQ", "textarea", 400, "Sí. Los planes incluyen IPv4, y en la mayoría de ubicaciones también IPv6, incluidos en el precio publicado."),
    ],
  },
  {
    path: "/dedicated",
    label: "Dedicados",
    description: "Héroe, casos de uso y FAQ dedicados.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Dedicated Servers"),
      f("title", "Título", "Héroe", "text", 100, "Bare-metal"),
      f("titleAccent", "Título acento", "Héroe", "text", 40, "power."),
      f("lead", "Lead", "Héroe", "textarea", 400, "Recursos dedicados y hardware configurable para cargas de trabajo exigentes."),
      f("popularTag", "Etiqueta popular", "Planes", "text", 40, "Más popular"),
      f("defaultTag", "Etiqueta plan", "Planes", "text", 40, "CALUSERVERS"),
      f("customNotice", "Aviso config a medida", "Planes", "textarea", 240, "¿Necesitas una configuración a medida?"),
      f("customCta", "CTA a medida", "Planes", "text", 80, "Habla con nuestro equipo"),
      f("customSuffix", "Sufijo a medida", "Planes", "textarea", 200, "y armamos el servidor que tu proyecto necesita."),
      f("useKicker", "Casos · kicker", "Casos", "text", 40, "Casos de uso"),
      f("useTitle", "Casos · título", "Casos", "text", 100, "Para proyectos que necesitan"),
      f("useTitleAccent", "Casos · acento", "Casos", "text", 60, "hardware propio."),
      f("useLead", "Casos · lead", "Casos", "textarea", 300, "Cuando compartir recursos ya no alcanza, el servidor completo es tuyo: CPU, RAM y disco sin vecinos."),
      f("use1Title", "Caso 1 título", "Casos", "text", 80, "Servidores de juegos"),
      f("use1Text", "Caso 1 texto", "Casos", "textarea", 400, "Hardware dedicado para comunidades y servidores de juegos que necesitan baja latencia, CPU de alta frecuencia y recursos estables con muchos jugadores conectados."),
      f("use2Title", "Caso 2 título", "Casos", "text", 80, "Aplicaciones exigentes"),
      f("use2Text", "Caso 2 texto", "Casos", "textarea", 400, "Bases de datos, APIs y aplicaciones con carga constante que piden RAM y almacenamiento NVMe dedicados, con red configurable según el proyecto."),
      f("use3Title", "Caso 3 título", "Casos", "text", 80, "Proyectos con control total"),
      f("use3Text", "Caso 3 texto", "Casos", "textarea", 400, "Elige tu sistema operativo, configura la red y la protección DDoS, y gestiona el servidor de forma remota. Nada compartido, nada que pedir prestado."),
      f("faqKicker", "FAQ · kicker", "FAQ", "text", 40, "Preguntas frecuentes"),
      f("faqTitle", "FAQ · título", "FAQ", "text", 40, "Dedicados,"),
      f("faqTitleAccent", "FAQ · acento", "FAQ", "text", 60, "sin letra pequeña."),
      f("faq1q", "FAQ 1 pregunta", "FAQ", "text", 120, "¿Qué significa que el hardware sea dedicado?"),
      f("faq1a", "FAQ 1 respuesta", "FAQ", "textarea", 400, "El servidor físico es solo tuyo: CPU, RAM y almacenamiento no se comparten con ningún otro cliente. Eliges entre Intel Xeon, AMD Ryzen o AMD EPYC según el plan."),
      f("faq2q", "FAQ 2 pregunta", "FAQ", "text", 120, "¿Puedo elegir el sistema operativo?"),
      f("faq2a", "FAQ 2 respuesta", "FAQ", "textarea", 400, "Sí. La selección de sistema operativo es parte de la configuración de cada servidor dedicado."),
      f("faq3q", "FAQ 3 pregunta", "FAQ", "text", 120, "¿Cómo se gestiona el servidor?"),
      f("faq3a", "FAQ 3 respuesta", "FAQ", "textarea", 400, "Cada plan incluye opciones de gestión remota y red configurable, además de opciones de protección DDoS. Puedes administrarlo tú o pedir una configuración a medida."),
      f("faq4q", "FAQ 4 pregunta", "FAQ", "text", 120, "¿Necesito una configuración que no está en la lista?"),
      f("faq4a", "FAQ 4 respuesta", "FAQ", "textarea", 400, "Sí, es posible. Habla con el equipo desde la página de Contacto y se arma el servidor que tu proyecto necesita."),
      f("faq5q", "FAQ 5 pregunta", "FAQ", "text", 120, "¿Cuándo conviene un dedicado frente a un VPS?"),
      f("faq5a", "FAQ 5 respuesta", "FAQ", "textarea", 400, "Cuando necesitas todo el hardware para ti solo, sin vecinos: cargas exigentes, servidores de juegos con muchos jugadores o proyectos que piden CPU, RAM y disco dedicados de forma constante."),
    ],
  },
  {
    path: "/domains",
    label: "Dominios",
    description: "Búsqueda y pasos de registro de dominios.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Domain Registration"),
      f("title", "Título", "Héroe", "text", 80, "Encuentra"),
      f("titleAccent", "Título acento", "Héroe", "text", 80, "tu lugar en línea."),
      f("lead", "Lead", "Héroe", "textarea", 400, "Busca tu dominio y gestiona registros y transferencias desde un solo lugar."),
      f("searchPlaceholder", "Placeholder búsqueda", "Buscador", "text", 80, "Escribe tu dominio perfecto"),
      f("searchButton", "Botón buscar", "Buscador", "text", 40, "Buscar dominio →"),
      f("searchHint", "Aviso disponibilidad", "Buscador", "textarea", 300, "La disponibilidad se verifica en el portal de cliente (WHMCS), con tu registrador de dominios."),
      f("stepsKicker", "Pasos · kicker", "Pasos", "text", 40, "Cómo funciona"),
      f("stepsTitle", "Pasos · título", "Pasos", "text", 60, "Tu dominio,"),
      f("stepsTitleAccent", "Pasos · acento", "Pasos", "text", 60, "en tres pasos."),
      f("stepsLead", "Pasos · lead", "Pasos", "textarea", 300, "La búsqueda y la verificación de disponibilidad se hacen en el portal de cliente, con tu registrador de dominios."),
      f("step1Title", "Paso 1 título", "Pasos", "text", 60, "Busca tu dominio"),
      f("step1Text", "Paso 1 texto", "Pasos", "textarea", 300, "Escribe el nombre que quieres en el buscador de arriba, con la extensión que prefieras (.com, .net, .org, .online, .info o .store)."),
      f("step2Title", "Paso 2 título", "Pasos", "text", 60, "Verifica la disponibilidad"),
      f("step2Text", "Paso 2 texto", "Pasos", "textarea", 300, "La disponibilidad se comprueba en el portal de cliente (WHMCS). Si está libre, lo añades al carrito y completas el registro."),
      f("step3Title", "Paso 3 título", "Pasos", "text", 60, "Gestiona todo en un lugar"),
      f("step3Text", "Paso 3 texto", "Pasos", "textarea", 300, "Registro, renovación y transferencia se gestionan desde tu panel de cliente, junto a tus planes de hosting y VPS."),
      f("tldCardText", "Texto tarjetas TLD", "TLDs", "textarea", 240, "Registro, renovación y transferencia gestionados por tu registrador de dominios."),
    ],
  },
  {
    path: "/about",
    label: "Nosotros",
    description: "Historia, misión y promesa.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Sobre CaluServers"),
      f("title", "Título", "Héroe", "text", 120, "Negocios de hosting que"),
      f("titleAccent", "Título acento", "Héroe", "text", 80, "confían desde 2013."),
      f("lead", "Lead", "Héroe", "textarea", 500, "Nuestro comienzo bajo otro nombre, HostZafiro, mantiene sitios web, tiendas y aplicaciones en línea con hosting SSD puro, infraestructura de nivel empresarial y soporte 24/7 por ticket que sí responde."),
      f("missionTitle", "Misión · título", "Pilares", "text", 60, "Nuestra misión"),
      f("missionText", "Misión · texto", "Pilares", "textarea", 300, "Hacer que la infraestructura de servidores y de alojamiento sea accesible, transparente y escalable."),
      f("focusTitle", "Enfoque · título", "Pilares", "text", 60, "Nuestro enfoque"),
      f("focusText", "Enfoque · texto", "Pilares", "textarea", 300, "Planes claros, apoyo práctico y opciones de infraestructura que se ajustan a las necesidades del cliente."),
      f("promiseTitle", "Promesa · título", "Pilares", "text", 60, "Nuestra promesa"),
      f("promiseText", "Promesa · texto", "Pilares", "textarea", 300, "Detalles honestos sobre el producto y una comunicación de servicio confiable."),
      f("storyKicker", "Historia · kicker", "Historia", "text", 40, "Nuestra historia"),
      f("storyTitle", "Historia · título", "Historia", "text", 80, "Desde 2013,"),
      f("storyTitleAccent", "Historia · acento", "Historia", "text", 80, "bajo otro nombre."),
      f("storyLead", "Historia · lead", "Historia", "textarea", 400, "CaluServers nació como HostZafiro. El nombre cambió; la idea sigue siendo la misma: hosting honesto, infraestructura seria y soporte que responde."),
      f("year1", "Timeline año 1", "Historia", "text", 20, "2013"),
      f("year1Title", "Timeline 1 título", "Historia", "text", 80, "El comienzo: HostZafiro"),
      f("year1Text", "Timeline 1 texto", "Historia", "textarea", 400, "Nuestro comienzo bajo otro nombre, HostZafiro, mantiene sitios web, tiendas y aplicaciones en línea con hosting SSD puro e infraestructura de nivel empresarial."),
      f("year2", "Timeline año 2", "Historia", "text", 20, "Hoy"),
      f("year2Title", "Timeline 2 título", "Historia", "text", 80, "CaluServers"),
      f("year2Text", "Timeline 2 texto", "Historia", "textarea", 400, "Web Hosting con cPanel y LiteSpeed, VPS con Ryzen 9 9950X y NVMe Gen 5 en cuatro ubicaciones de EE. UU., servidores dedicados y registro de dominios, todo bajo una misma marca."),
      f("year3", "Timeline año 3", "Historia", "text", 20, "24/7"),
      f("year3Title", "Timeline 3 título", "Historia", "text", 80, "Soporte que sí responde"),
      f("year3Text", "Timeline 3 texto", "Historia", "textarea", 400, "Soporte por ticket en inglés y español, todos los días del año, con monitoreo proactivo del host y cobertura de soporte."),
    ],
  },
  {
    path: "/contact",
    label: "Contacto",
    description: "Textos de contacto y formulario.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Contacto"),
      f("title", "Título", "Héroe", "text", 100, "Hablemos."),
      f("lead", "Lead (fallback; SiteSettings.contactLead tiene prioridad si se usa)", "Héroe", "textarea", 400, "Abre un ticket en el área de cliente o escríbenos. Respondemos en inglés y español."),
      f("submitLabel", "Botón enviar", "Formulario", "text", 40, "Enviar mensaje"),
      f("formNote", "Nota formulario", "Formulario", "textarea", 240, "Tu mensaje abre un ticket en nuestro portal de cliente, donde el equipo te responde."),
      f("labelName", "Etiqueta nombre", "Formulario", "text", 40, "Nombre"),
      f("labelEmail", "Etiqueta email", "Formulario", "text", 40, "Email"),
      f("labelDept", "Etiqueta departamento", "Formulario", "text", 40, "Departamento"),
      f("labelMessage", "Etiqueta mensaje", "Formulario", "text", 40, "Mensaje"),
    ],
  },
  {
    path: "/client",
    label: "Área de cliente",
    description: "Puerta de enlace al portal WHMCS.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Client Portal"),
      f("title", "Título", "Héroe", "text", 80, "Tus servicios."),
      f("titleAccent", "Título acento", "Héroe", "text", 80, "Un solo lugar."),
      f("lead", "Lead", "Héroe", "textarea", 400, "Accede a facturación, servicios, dominios y soporte a través del portal de cliente de CaluServers."),
      f("ctaTitle", "CTA título", "Acciones", "text", 80, "Bienvenido al Área de Cliente"),
      f("ctaLead", "CTA lead", "Acciones", "textarea", 240, "Inicia sesión o crea una cuenta en nuestro portal de cliente (WHMCS)."),
      f("ctaLabel", "CTA botón", "Acciones", "text", 60, "Abrir Área de Cliente ↗"),
    ],
  },
  {
    path: "/abuse",
    label: "Abuso",
    description: "Formulario y textos de reporte de abuso.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Trust & Safety"),
      f("title", "Título", "Héroe", "text", 80, "Reportar"),
      f("titleAccent", "Título acento", "Héroe", "text", 40, "abuso."),
      f("lead", "Lead", "Héroe", "textarea", 400, "Reporta spam, phishing, malware, infracción de copyright o abuso de red."),
      f("submitLabel", "Botón enviar", "Formulario", "text", 40, "Enviar reporte"),
      f("formNote", "Nota formulario", "Formulario", "textarea", 240, "Los reportes se canalizan a nuestro buzón de abuso monitoreado."),
      f("labelName", "Etiqueta nombre", "Formulario", "text", 40, "Tu nombre"),
      f("labelEmail", "Etiqueta email", "Formulario", "text", 40, "Email"),
      f("labelTarget", "Etiqueta dominio/IP", "Formulario", "text", 80, "Dominio o IP involucrada"),
      f("labelCategory", "Etiqueta categoría", "Formulario", "text", 60, "Categoría de abuso"),
      f("labelDescription", "Etiqueta descripción", "Formulario", "text", 120, "Descripción detallada y enlaces de evidencia"),
    ],
  },
  {
    path: "/terms",
    label: "Términos",
    description: "Encabezado y secciones de términos.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "CaluServers Legal"),
      f("title", "Título", "Héroe", "text", 100, "Términos y Condiciones"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Por favor revisa estas políticas antes de pedir o usar nuestros servicios."),
      f("sec1Heading", "Sección 1 título", "Cuerpo", "text", 120, "1. Acuerdo"),
      f("sec1Text", "Sección 1 texto", "Cuerpo", "textarea", 800, "Estos Términos y Condiciones son una plantilla inicial y deben ser revisados por un asesor legal calificado y adaptados a las leyes y operaciones reales de CaluServers antes de su publicación."),
      f("sec2Heading", "Sección 2 título", "Cuerpo", "text", 120, "2. Servicios"),
      f("sec2Text", "Sección 2 texto", "Cuerpo", "textarea", 800, "Los servicios se prestan según la descripción del producto, la confirmación del pedido y cualquier acuerdo de nivel de servicio aplicable. Las funciones, ubicaciones y disponibilidad deben confirmarse al momento de la compra."),
      f("sec3Heading", "Sección 3 título", "Cuerpo", "text", 120, "3. Facturación y pagos"),
      f("sec3Text", "Sección 3 texto", "Cuerpo", "textarea", 800, "Las tarifas, ciclos de facturación, fechas de vencimiento, impuestos, manejo de pagos atrasados y métodos de pago aceptados deben divulgarse claramente antes de la compra. Los clientes son responsables de mantener sus datos de facturación actualizados."),
      f("sec4Heading", "Sección 4 título", "Cuerpo", "text", 120, "4. Uso aceptable"),
      f("sec4Text", "Sección 4 texto", "Cuerpo", "textarea", 800, "Los clientes deben cumplir con la ley aplicable y la Política de Uso Aceptable. Se prohíben el abuso, la actividad maliciosa, el envío masivo no solicitado y el contenido ilegal."),
      f("sec5Heading", "Sección 5 título", "Cuerpo", "text", 120, "5. Suspensión y terminación"),
      f("sec5Text", "Sección 5 texto", "Cuerpo", "textarea", 800, "CaluServers puede investigar reportes creíbles de abuso y tomar medidas proporcionales conforme a la ley aplicable y al acuerdo con el cliente. Pueden requerirse acciones de emergencia para proteger los sistemas y redes."),
      f("sec6Heading", "Sección 6 título", "Cuerpo", "text", 120, "6. Reembolsos y cancelaciones"),
      f("sec6Text", "Sección 6 texto", "Cuerpo", "textarea", 800, "Publica una política clara de reembolsos y cancelaciones por producto antes de aceptar pedidos. No implies una garantía de reembolso salvo que haya sido aprobada y pueda cumplirse."),
      f("sec7Heading", "Sección 7 título", "Cuerpo", "text", 120, "7. Responsabilidad y garantías"),
      f("sec7Text", "Sección 7 texto", "Cuerpo", "textarea", 800, "Cualquier limitación, garantía, crédito de servicio y compromiso de uptime debe indicarse en el acuerdo final con el cliente y revisarse para verificar su aplicabilidad."),
      f("sec8Heading", "Sección 8 título", "Cuerpo", "text", 120, "8. Contacto"),
      f("sec8Text", "Sección 8 texto", "Cuerpo", "textarea", 800, "Reemplaza esta sección con tus datos verificados de contacto legal y de soporte."),
    ],
  },
  {
    path: "/privacy",
    label: "Privacidad",
    description: "Encabezado y secciones de privacidad.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "CaluServers Legal"),
      f("title", "Título", "Héroe", "text", 100, "Política de Privacidad"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Por favor revisa estas políticas antes de pedir o usar nuestros servicios."),
      f("sec1Heading", "Sección 1 título", "Cuerpo", "text", 120, "Aviso de privacidad"),
      f("sec1Text", "Sección 1 texto", "Cuerpo", "textarea", 800, "Describe la información personal recopilada, los fines del tratamiento, las bases legales cuando apliquen, los procesadores, los plazos de retención, las medidas de seguridad, las transferencias internacionales y los derechos de privacidad de los clientes."),
      f("sec2Heading", "Sección 2 título", "Cuerpo", "text", 120, "Entidad responsable"),
      f("sec2Text", "Sección 2 texto", "Cuerpo", "textarea", 800, "Identifica la entidad comercial real que opera CaluServers y proporciona un contacto de privacidad verificado. Este texto es una plantilla, no una política de privacidad completa."),
    ],
  },
  {
    path: "/aup",
    label: "AUP",
    description: "Política de uso aceptable.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "CaluServers Legal"),
      f("title", "Título", "Héroe", "text", 100, "Política de Uso Aceptable"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Por favor revisa estas políticas antes de pedir o usar nuestros servicios."),
      f("sec1Heading", "Sección 1 título", "Cuerpo", "text", 120, "Actividad prohibida"),
      f("sec1Text", "Sección 1 texto", "Cuerpo", "textarea", 800, "Los clientes no pueden usar los servicios para phishing, distribución de malware, acceso no autorizado, spam, fraude, infracción de copyright, ataques de denegación de servicio u otra actividad ilegal."),
      f("sec2Heading", "Sección 2 título", "Cuerpo", "text", 120, "Integridad de la red"),
      f("sec2Text", "Sección 2 texto", "Cuerpo", "textarea", 800, "Los clientes no deben interferir con las operaciones de red, intentar eludir los controles de seguridad ni usar los recursos de forma que perjudique a otros clientes."),
      f("sec3Heading", "Sección 3 título", "Cuerpo", "text", 120, "Reportes y aplicación"),
      f("sec3Text", "Sección 3 texto", "Cuerpo", "textarea", 800, "Los reportes pueden enviarse a través de la página de Abuso. CaluServers debe publicar sus procedimientos de investigación, preservación de evidencia, escalamiento y apelación."),
    ],
  },
  {
    path: "/404",
    label: "404",
    description: "Página no encontrada.",
    fields: [
      f("kicker", "Kicker", "Contenido", "text", 20, "404"),
      f("title", "Título", "Contenido", "text", 80, "Página no encontrada"),
      f("lead", "Lead", "Contenido", "textarea", 240, "El enlace no existe o se ha movido. Vuelve al inicio o explora nuestros planes."),
      f("homeCta", "CTA inicio", "Contenido", "text", 40, "Ir al inicio"),
      f("hostingCta", "CTA hosting", "Contenido", "text", 40, "Ver hosting"),
      f("vpsCta", "CTA VPS", "Contenido", "text", 40, "Ver VPS"),
    ],
  },
];

export const PAGE_PATHS = PAGE_DEFS.map((p) => p.path);

export function getPageDef(path: string): PageDef | undefined {
  return PAGE_DEFS.find((p) => p.path === path);
}

export function defaultPayload(path: string): Record<string, string> {
  const def = getPageDef(path);
  if (!def) return {};
  const out: Record<string, string> = {};
  for (const field of def.fields) out[field.id] = field.defaultValue;
  return out;
}

export function allDefaultPayloads(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const p of PAGE_DEFS) out[p.path] = defaultPayload(p.path);
  return out;
}

export function mergePagePayload(
  path: string,
  stored: unknown,
): Record<string, string> {
  const base = defaultPayload(path);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return base;
  const obj = stored as Record<string, unknown>;
  const out = { ...base };
  for (const field of getPageDef(path)?.fields ?? []) {
    const v = obj[field.id];
    if (typeof v === "string") out[field.id] = v;
  }
  return out;
}

export function validatePagePayload(
  path: string,
  payload: Record<string, string>,
): string | null {
  const def = getPageDef(path);
  if (!def) return `Ruta no soportada: ${path}`;
  for (const field of def.fields) {
    const value = payload[field.id] ?? "";
    if (field.type === "url") {
      if (value.trim() && !isHttpsUrl(value.trim())) {
        return `${field.label}: usa https.`;
      }
    } else if (field.type === "path") {
      if (value.trim() && !isSafeHref(value.trim())) {
        return `${field.label}: ruta interna, whmcs o https.`;
      }
    } else if (!isPlainText(value, field.max)) {
      return `${field.label}: texto plano sin HTML (máx. ${field.max}).`;
    }
  }
  return null;
}

export function pc(
  payload: Record<string, string>,
  id: string,
  fallback = "",
): string {
  const v = payload[id];
  return typeof v === "string" && v.length ? v : fallback;
}
