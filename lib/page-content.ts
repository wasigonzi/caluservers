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
      f("step2Title", "Paso 2 título", "Pasos", "text", 60, "Compra segura en tu cuenta"),
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
      f("faq1a", "FAQ 1 respuesta", "FAQ", "textarea", 500, "Elige el plan que te convenga y pulsa «Contratar aquí». El pedido se completa en tu área de cliente, donde también gestionas facturación y renovaciones."),
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
      f("lead", "Lead", "Héroe", "textarea", 400, "Escribe el dominio que quieres y te decimos si está libre. El registro y la renovación se gestionan en tu panel de cliente."),
      f("searchPlaceholder", "Placeholder búsqueda", "Buscador", "text", 80, "Escribe tu dominio perfecto"),
      f("searchButton", "Botón buscar", "Buscador", "text", 40, "Comprobar"),
      f("searchHint", "Aviso disponibilidad", "Buscador", "textarea", 300, "Comprobamos la disponibilidad en el registro oficial de la extensión. El registro se completa en el portal de cliente."),
      f("stepsKicker", "Pasos · kicker", "Pasos", "text", 40, "Cómo funciona"),
      f("stepsTitle", "Pasos · título", "Pasos", "text", 60, "Tu dominio,"),
      f("stepsTitleAccent", "Pasos · acento", "Pasos", "text", 60, "en tres pasos."),
      f("stepsLead", "Pasos · lead", "Pasos", "textarea", 300, "La comprobación ocurre aquí; el pago y el registro, en el portal de cliente."),
      f("step1Title", "Paso 1 título", "Pasos", "text", 60, "Busca tu dominio"),
      f("step1Text", "Paso 1 texto", "Pasos", "textarea", 300, "Escribe el nombre que quieres en el buscador de arriba, con la extensión que prefieras (.com, .net, .org, .online, .info o .store)."),
      f("step2Title", "Paso 2 título", "Pasos", "text", 60, "Verifica la disponibilidad"),
      f("step2Text", "Paso 2 texto", "Pasos", "textarea", 300, "Consultamos el registro oficial de la extensión y te decimos si está libre, ocupado o si el registro no respondió."),
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
      f("lead", "Lead (fallback; SiteSettings.contactLead tiene prioridad si se usa)", "Héroe", "textarea", 400, "Escríbenos y te respondemos al correo que indiques. El mensaje queda registrado en nuestro panel."),
      f("submitLabel", "Botón enviar", "Formulario", "text", 40, "Enviar mensaje"),
      f("formNote", "Nota formulario", "Formulario", "textarea", 240, "El mensaje llega a nuestro equipo y te respondemos al correo que indiques."),
      f("labelName", "Etiqueta nombre", "Formulario", "text", 40, "Nombre"),
      f("labelEmail", "Etiqueta email", "Formulario", "text", 40, "Email"),
      f("labelDept", "Etiqueta departamento", "Formulario", "text", 40, "Departamento"),
      f("labelMessage", "Etiqueta mensaje", "Formulario", "text", 40, "Mensaje"),
    ],
  },
  {
    path: "/client",
    label: "Área de cliente",
    description: "Área de cliente propia (/cuenta).",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Client Portal"),
      f("title", "Título", "Héroe", "text", 80, "Tus servicios."),
      f("titleAccent", "Título acento", "Héroe", "text", 80, "Un solo lugar."),
      f("lead", "Lead", "Héroe", "textarea", 400, "Accede a facturación, servicios, dominios y soporte a través del portal de cliente de CaluServers."),
      f("ctaTitle", "CTA título", "Acciones", "text", 80, "Bienvenido al Área de Cliente"),
      f("ctaLead", "CTA lead", "Acciones", "textarea", 240, "Inicia sesión o crea una cuenta en el área de cliente de CaluServers."),
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
      f("formNote", "Nota formulario", "Formulario", "textarea", 240, "El reporte queda registrado con fecha y lo revisa nuestro equipo de Trust & Safety."),
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
      f("sec1Text", "Sección 1 texto", "Cuerpo", "textarea", 800, "Al crear una cuenta, hacer un pedido o usar cualquier servicio de CaluServers aceptas estos Términos y Condiciones, la Política de Uso Aceptable y la Política de Privacidad. CaluServers ofrece Web Hosting, VPS, servidores dedicados y registro de dominios. El servicio nació en 2013 con el nombre HostZafiro y hoy opera como CaluServers."),
      f("sec2Heading", "Sección 2 título", "Cuerpo", "text", 120, "2. Servicios"),
      f("sec2Text", "Sección 2 texto", "Cuerpo", "textarea", 800, "Web Hosting: Calu Starter $3.99 al mes, Calu Professional $6.99 al mes y Business $9.99 al mes, con cPanel, SSL gratis, cuentas de correo y almacenamiento NVMe SSD. VPS: desde $1.99 al mes hasta $99.99 al mes según la ubicación (Dallas, Los Angeles, New York o Miami) y el nivel, con acceso root y IPv4 incluida. Servidores dedicados: hardware físico solo para ti; su precio no está publicado y se confirma en el portal de cliente. Dominios: .com, .net, .org, .online, .info y .store. El precio que ves al hacer el pedido es el que se factura."),
      f("sec3Heading", "Sección 3 título", "Cuerpo", "text", 120, "3. Pedido y activación"),
      f("sec3Text", "Sección 3 texto", "Cuerpo", "textarea", 800, "El pedido se hace desde tu cuenta: eliges el plan, se genera el pedido con su factura y pagas. Cuando se confirma el pago, el servicio aparece en tu panel del cliente. Para el hosting, el dominio que declares en el pedido es el que se usa para crear tu cuenta de cPanel. La contraseña inicial de cPanel se muestra en tu panel, solo a ti; cámbiala al entrar por primera vez. La activación puede requerir una revisión manual por parte del equipo, por lo que no publicamos un plazo fijo de alta."),
      f("sec4Heading", "Sección 4 título", "Cuerpo", "text", 120, "4. Facturación y pagos"),
      f("sec4Text", "Sección 4 texto", "Cuerpo", "textarea", 800, "Cada pedido genera una factura con el importe, la moneda y el detalle del plan. Puedes pagar en línea con PayPal o por cobro manual, que el equipo confirma en el panel. Mientras no se confirme el pago, la factura sigue pendiente y el servicio no se activa; si cancelas el pago en PayPal, la factura sigue pendiente y puedes pagarla cuando quieras. Los impuestos, si aplican, se muestran en la factura; si aún no están determinados, la factura lo indica como por determinar. Mantén actualizados tus datos de facturación y el correo de tu cuenta."),
      f("sec5Heading", "Sección 5 título", "Cuerpo", "text", 120, "5. Uso aceptable"),
      f("sec5Text", "Sección 5 texto", "Cuerpo", "textarea", 800, "Debes usar los servicios conforme a la ley y a la Política de Uso Aceptable. Eres responsable del contenido que alojes y de todo lo que instales y ejecutes en tu VPS o servidor dedicado, donde tienes acceso root. No puedes usar los servicios para actividades ilegales, abuso de red, spam, phishing, malware ni fraude. Si tu servicio se usa para abusar de terceros, aunque sea por un programa que instalaste, la responsabilidad es tuya."),
      f("sec6Heading", "Sección 6 título", "Cuerpo", "text", 120, "6. Suspensión y terminación"),
      f("sec6Text", "Sección 6 texto", "Cuerpo", "textarea", 800, "Investigamos los reportes creíbles de abuso que recibimos y tomamos medidas proporcionales, que pueden incluir la suspensión o la terminación del servicio. En emergencias, cuando hay un riesgo para los sistemas, la red u otros clientes, podemos actuar de inmediato para protegerlos. Si tu servicio se suspende, puedes pedir información y responder por ticket desde tu panel del cliente."),
      f("sec7Heading", "Sección 7 título", "Cuerpo", "text", 120, "7. Cancelación"),
      f("sec7Text", "Sección 7 texto", "Cuerpo", "textarea", 800, "Para cancelar un servicio, abre un ticket desde tu panel del cliente o escribe a soporte@caluservers.com. La cancelación se registra en tu panel. Ten en cuenta que cancelar el servicio en el panel no suspende ni borra por sí sola la cuenta en el servidor: si quieres la baja completa y la eliminación de tu contenido alojado, indícalo expresamente al pedir la cancelación."),
      f("sec8Heading", "Sección 8 título", "Cuerpo", "text", 120, "8. Reembolsos"),
      f("sec8Text", "Sección 8 texto", "Cuerpo", "textarea", 800, "Web Hosting: si durante tu primer mes sientes que el hosting no es para ti, te reembolsamos las tarifas de hosting, como se publica en la página de Web Hosting. Para VPS, servidores dedicados y dominios el sitio no publica una garantía de devolución, así que revisa el importe de la factura antes de pagar."),
      f("sec9Heading", "Sección 9 título", "Cuerpo", "text", 120, "9. Disponibilidad y responsabilidad"),
      f("sec9Text", "Sección 9 texto", "Cuerpo", "textarea", 800, "El sitio publica un compromiso de 99,9 % de tiempo activo y monitoreo proactivo de los servidores, y el hosting incluye copias diarias, SSL gratis y migración gratis desde cualquier proveedor. No publicamos importes de crédito por interrupciones. Eres responsable de tus archivos, de tus contraseñas y de mantener copias propias de lo que consideres importante. El contenido que publiques y los programas que instales son tu responsabilidad."),
      f("sec10Heading", "Sección 10 título", "Cuerpo", "text", 120, "10. Contacto"),
      f("sec10Text", "Sección 10 texto", "Cuerpo", "textarea", 800, "Soporte 24/7 por ticket, en inglés y español, desde tu panel del cliente. Correo de soporte: soporte@caluservers.com. Para reportar abuso usa la página de Abuso o escribe a ese mismo correo. Titular: [dato a completar por el propietario: nombre legal, dirección y número de registro]."),
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
      f("sec1Heading", "Sección 1 título", "Cuerpo", "text", 120, "1. Datos que recogemos"),
      f("sec1Text", "Sección 1 texto", "Cuerpo", "textarea", 800, "Cuando creas una cuenta recogemos tu nombre y tu correo electrónico, y opcionalmente una imagen de perfil. En cada pedido guardamos el plan, el dominio que declares, el importe y la moneda. De las facturas y los pagos guardamos el importe, el método (PayPal o cobro manual) y la referencia del pago. En soporte guardamos el asunto y los mensajes de tus tickets. En los formularios de contacto y de abuso guardamos tu nombre, correo, tema, el dominio o la IP reportada y tu mensaje. Por seguridad, las sesiones registran la dirección IP y el agente de usuario."),
      f("sec2Heading", "Sección 2 título", "Cuerpo", "text", 120, "2. Para qué los usamos"),
      f("sec2Text", "Sección 2 texto", "Cuerpo", "textarea", 800, "Usamos tus datos para crear y gestionar tu cuenta, tramitar tus pedidos y facturas, activar tus servicios, responder a tus tickets y mensajes de contacto, y proteger el servicio frente al abuso y los accesos no autorizados. También usamos tu correo para enviarte los avisos del servicio, como la confirmación del pedido, la factura y las respuestas de soporte. No usamos tus datos para otra finalidad distinta a prestarte el servicio contratado."),
      f("sec3Heading", "Sección 3 título", "Cuerpo", "text", 120, "3. Con quién se comparten"),
      f("sec3Text", "Sección 3 texto", "Cuerpo", "textarea", 800, "Compartimos tus datos solo con quien hace falta para prestarte el servicio: la pasarela PayPal cuando pagas en línea, el panel del servidor (WHM y cPanel) para crear tu cuenta de hosting, y el servicio de correo que envía los avisos. No publicamos tus datos ni los entregamos a terceros para fines distintos a los descritos en esta política."),
      f("sec4Heading", "Sección 4 título", "Cuerpo", "text", 120, "4. Seguridad"),
      f("sec4Text", "Sección 4 texto", "Cuerpo", "textarea", 800, "El acceso a tu cuenta es con tu correo y contraseña; no compartas tus credenciales con nadie. Las sesiones usan cookies de sesión y los límites de intentos de acceso no guardan tu dirección IP en claro. La contraseña inicial de cPanel se muestra solo al dueño de la cuenta en su panel. Si sospechas que alguien entró en tu cuenta, cambia tu contraseña y abre un ticket de inmediato."),
      f("sec5Heading", "Sección 5 título", "Cuerpo", "text", 120, "5. Tus derechos"),
      f("sec5Text", "Sección 5 texto", "Cuerpo", "textarea", 800, "Puedes revisar y actualizar los datos de tu perfil desde tu panel del cliente. También puedes pedirnos el acceso, la corrección o la eliminación de tus datos personales escribiendo a soporte@caluservers.com desde el correo de tu cuenta. Atendemos cada solicitud desde soporte y te respondemos por ese mismo correo. No publicamos un plazo fijo de respuesta en este documento."),
      f("sec6Heading", "Sección 6 título", "Cuerpo", "text", 120, "6. Cookies y contacto"),
      f("sec6Text", "Sección 6 texto", "Cuerpo", "textarea", 800, "El sitio usa cookies de sesión, necesarias para mantenerte dentro de tu panel del cliente; sin ellas no puedes iniciar sesión ni gestionar tus servicios. El sitio no describe cookies de analítica ni de publicidad. Para cualquier duda sobre privacidad, escribe a soporte@caluservers.com. Titular: [dato a completar por el propietario: nombre legal, dirección y número de registro]."),
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
      f("sec1Heading", "Sección 1 título", "Cuerpo", "text", 120, "1. Actividad prohibida"),
      f("sec1Text", "Sección 1 texto", "Cuerpo", "textarea", 800, "No puedes usar los servicios para phishing, distribución de malware, acceso no autorizado a otros sistemas, spam, fraude, infracción de derechos de autor (incluidas las reclamaciones DMCA), ataques de denegación de servicio ni ninguna otra actividad ilegal. Tampoco puedes alojar ni distribuir contenido ilegal desde tu hosting, VPS o servidor dedicado."),
      f("sec2Heading", "Sección 2 título", "Cuerpo", "text", 120, "2. Integridad de la red"),
      f("sec2Text", "Sección 2 texto", "Cuerpo", "textarea", 800, "No debes interferir con las operaciones de la red, intentar eludir los controles de seguridad ni usar los recursos de forma que perjudique a otros clientes. Los recursos contratados son para tu servicio: no puedes usarlos para atacar, escanear o saturar otros sistemas."),
      f("sec3Heading", "Sección 3 título", "Cuerpo", "text", 120, "3. Correo y uso responsable"),
      f("sec3Text", "Sección 3 texto", "Cuerpo", "textarea", 800, "Las cuentas de correo incluidas en el hosting son para tu comunicación normal. No puedes usar los servicios para envío masivo no solicitado (spam), para suplantar a otros remitentes ni para enviar correo engañoso. Si tu cuenta envía spam, aunque sea por un programa que instalaste, se trata como abuso de tu servicio."),
      f("sec4Heading", "Sección 4 título", "Cuerpo", "text", 120, "4. Tu servidor, tu responsabilidad"),
      f("sec4Text", "Sección 4 texto", "Cuerpo", "textarea", 800, "En los VPS y servidores dedicados tienes acceso root o de administrador total: instalas lo que quieras y eliges tu sistema operativo. Con ese control va la responsabilidad de mantener tu servidor actualizado, proteger sus accesos y responder por todo lo que se ejecute en él. Si tu servidor se usa para atacar a otros o enviar spam, actuamos sobre tu servicio aunque tú no lo hayas hecho directamente."),
      f("sec5Heading", "Sección 5 título", "Cuerpo", "text", 120, "5. Reportes de abuso"),
      f("sec5Text", "Sección 5 texto", "Cuerpo", "textarea", 800, "Puedes reportar abuso desde la página de Abuso o escribiendo a soporte@caluservers.com. Indica el dominio o la IP involucrada, la categoría (Spam, Phishing, Malware, Copyright / DMCA, Abuso de red, Fraude u Otro), una descripción detallada y enlaces de evidencia cuando los tengas. El reporte queda registrado con fecha y lo revisa nuestro equipo."),
      f("sec6Heading", "Sección 6 título", "Cuerpo", "text", 120, "6. Aplicación y consecuencias"),
      f("sec6Text", "Sección 6 texto", "Cuerpo", "textarea", 800, "Investigamos cada reporte creíble y tomamos medidas proporcionales según la gravedad: aviso, suspensión o terminación del servicio. En emergencias podemos actuar de inmediato para proteger los sistemas, la red y los demás clientes. Si tu servicio se ve afectado por una medida, puedes responder y pedir información por ticket desde tu panel del cliente. Titular: [dato a completar por el propietario: nombre legal, dirección y número de registro]."),
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
