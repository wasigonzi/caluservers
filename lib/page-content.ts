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
    description: "Home: hero (también en SiteSettings), trust, pasos, FAQ, etc.",
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
      f("compareColWeb", "Columna Web Hosting", "Comparativa", "text", 40, "Web Hosting"),
      f("compareColVps", "Columna VPS", "Comparativa", "text", 40, "VPS"),
      f("compareColDed", "Columna Dedicado", "Comparativa", "text", 40, "Dedicado"),
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
    description: "Héroe, includes, FAQ del hosting compartido.",
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
    description: "Héroe, configurador copy, FAQ VPS.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "VPS Cloud"),
      f("title", "Título", "Héroe", "text", 100, "VPS con root total"),
      f("titleAccent", "Título acento", "Héroe", "text", 80, "y NVMe Gen 5"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Servidores virtuales potentes en cuatro ubicaciones de EE. UU. con Ryzen 9 9950X."),
      f("faqKicker", "FAQ · kicker", "FAQ", "text", 40, "Preguntas frecuentes"),
      f("faqTitle", "FAQ · título", "FAQ", "text", 80, "Todo sobre nuestros VPS"),
      f("faq1q", "FAQ 1 pregunta", "FAQ", "text", 120, "¿Incluye acceso root?"),
      f("faq1a", "FAQ 1 respuesta", "FAQ", "textarea", 400, "Sí. Todos los VPS incluyen acceso root / administrador total."),
      f("faq2q", "FAQ 2 pregunta", "FAQ", "text", 120, "¿Qué ubicaciones hay?"),
      f("faq2a", "FAQ 2 respuesta", "FAQ", "textarea", 400, "Dallas, Los Angeles, New York y Miami."),
      f("faq3q", "FAQ 3 pregunta", "FAQ", "text", 120, "¿Puedo reinstalar el SO?"),
      f("faq3a", "FAQ 3 respuesta", "FAQ", "textarea", 400, "Sí. Puedes reinstalar y gestionar el sistema desde el panel."),
    ],
  },
  {
    path: "/dedicated",
    label: "Dedicados",
    description: "Héroe, casos de uso, FAQ dedicados.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Dedicated Servers"),
      f("title", "Título", "Héroe", "text", 100, "Hardware completo"),
      f("titleAccent", "Título acento", "Héroe", "text", 80, "sin vecinos"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Recursos dedicados y hardware configurable para cargas de trabajo exigentes."),
      f("popularTag", "Etiqueta popular", "Planes", "text", 40, "Más popular"),
      f("defaultTag", "Etiqueta plan", "Planes", "text", 40, "CALUSERVERS"),
      f("useKicker", "Casos · kicker", "Casos", "text", 40, "Casos de uso"),
      f("useTitle", "Casos · título", "Casos", "text", 80, "Cuando necesitas el servidor completo"),
      f("useLead", "Casos · lead", "Casos", "textarea", 300, "Cuando compartir recursos ya no alcanza, el servidor completo es tuyo: CPU, RAM y disco sin vecinos."),
      f("faqKicker", "FAQ · kicker", "FAQ", "text", 40, "Preguntas frecuentes"),
      f("faqTitle", "FAQ · título", "FAQ", "text", 80, "Servidores dedicados"),
      f("faq1q", "FAQ 1 pregunta", "FAQ", "text", 120, "¿El hardware es solo mío?"),
      f("faq1a", "FAQ 1 respuesta", "FAQ", "textarea", 400, "El servidor físico es solo tuyo: CPU, RAM y almacenamiento no se comparten con ningún otro cliente. Eliges entre Intel Xeon, AMD Ryzen o AMD EPYC según el plan."),
      f("faq2q", "FAQ 2 pregunta", "FAQ", "text", 120, "¿Puedo elegir el sistema operativo?"),
      f("faq2a", "FAQ 2 respuesta", "FAQ", "textarea", 400, "Sí. La selección de sistema operativo es parte de la configuración de cada servidor dedicado."),
      f("faq3q", "FAQ 3 pregunta", "FAQ", "text", 120, "¿Incluye gestión remota?"),
      f("faq3a", "FAQ 3 respuesta", "FAQ", "textarea", 400, "Cada plan incluye opciones de gestión remota y red configurable, además de opciones de protección DDoS. Puedes administrarlo tú o pedir una configuración a medida."),
      f("faq4q", "FAQ 4 pregunta", "FAQ", "text", 120, "¿Arman un servidor a medida?"),
      f("faq4a", "FAQ 4 respuesta", "FAQ", "textarea", 400, "Sí, es posible. Habla con el equipo desde la página de Contacto y se arma el servidor que tu proyecto necesita."),
      f("faq5q", "FAQ 5 pregunta", "FAQ", "text", 120, "¿Cuándo conviene un dedicado?"),
      f("faq5a", "FAQ 5 respuesta", "FAQ", "textarea", 400, "Cuando necesitas todo el hardware para ti solo, sin vecinos: cargas exigentes, servidores de juegos con muchos jugadores o proyectos que piden CPU, RAM y disco dedicados de forma constante."),
    ],
  },
  {
    path: "/domains",
    label: "Dominios",
    description: "Búsqueda y textos de dominios.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Dominios"),
      f("title", "Título", "Héroe", "text", 100, "Registra tu dominio"),
      f("titleAccent", "Título acento", "Héroe", "text", 80, "en minutos"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Busca disponibilidad y completa el registro en el portal de cliente seguro."),
      f("searchPlaceholder", "Placeholder búsqueda", "Buscador", "text", 80, "tudominio.com"),
      f("searchButton", "Botón buscar", "Buscador", "text", 40, "Buscar"),
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
    description: "Textos de contacto (lead también en SiteSettings).",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Contacto"),
      f("title", "Título", "Héroe", "text", 100, "Estamos para ayudarte"),
      f("titleAccent", "Título acento", "Héroe", "text", 80, "24/7"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Abre un ticket en el área de cliente o escríbenos. Respondemos en inglés y español."),
      f("ticketCta", "CTA ticket", "Acciones", "text", 60, "Abrir ticket"),
      f("clientCta", "CTA área cliente", "Acciones", "text", 60, "Área de cliente"),
    ],
  },
  {
    path: "/client",
    label: "Área de cliente",
    description: "Puerta de enlace al portal WHMCS.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Clientes"),
      f("title", "Título", "Héroe", "text", 100, "Tu panel de control"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Gestiona servicios, facturas y tickets en el portal seguro de CaluServers."),
      f("ctaLabel", "CTA", "Acciones", "text", 60, "Ir al área de cliente"),
    ],
  },
  {
    path: "/abuse",
    label: "Abuso",
    description: "Formulario / textos de reporte de abuso.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Abuso"),
      f("title", "Título", "Héroe", "text", 100, "Reportar abuso"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Si detectas actividad abusiva en nuestra red, cuéntanoslo. Revisamos cada reporte."),
      f("submitLabel", "Botón enviar", "Formulario", "text", 40, "Enviar reporte"),
    ],
  },
  {
    path: "/terms",
    label: "Términos",
    description: "Encabezado legal (cuerpo en LEGAL_TERMS seed).",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Legal"),
      f("title", "Título", "Héroe", "text", 100, "Términos y condiciones"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Condiciones de uso de los servicios de CaluServers."),
    ],
  },
  {
    path: "/privacy",
    label: "Privacidad",
    description: "Encabezado de política de privacidad.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Legal"),
      f("title", "Título", "Héroe", "text", 100, "Política de privacidad"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Cómo tratamos tus datos personales."),
    ],
  },
  {
    path: "/aup",
    label: "AUP",
    description: "Política de uso aceptable.",
    fields: [
      f("kicker", "Kicker", "Héroe", "text", 40, "Legal"),
      f("title", "Título", "Héroe", "text", 100, "Política de uso aceptable"),
      f("lead", "Lead", "Héroe", "textarea", 400, "Usos permitidos y prohibidos en la red CaluServers."),
    ],
  },
  {
    path: "/404",
    label: "404",
    description: "Página no encontrada.",
    fields: [
      f("title", "Título", "Contenido", "text", 80, "Página no encontrada"),
      f("lead", "Lead", "Contenido", "textarea", 240, "La ruta no existe o se movió. Vuelve al inicio o explora nuestros planes."),
      f("homeCta", "CTA inicio", "Contenido", "text", 40, "Ir al inicio"),
      f("hostingCta", "CTA hosting", "Contenido", "text", 40, "Web Hosting"),
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
