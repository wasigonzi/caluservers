// Formulario propio de contacto y abuso. Todos los datos son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { loader } from "./helpers/load.mjs";

function dbMock(overrides = {}) {
  const created = [];
  const updated = [];
  return {
    created,
    updated,
    db: {
      contactMessage: {
        create: async ({ data }) => {
          created.push(data);
          return { id: "msg_1" };
        },
        update: async (args) => {
          updated.push(args);
          return { id: "msg_1" };
        },
      },
      siteSetting: { findUnique: async () => null },
      ...overrides,
    },
  };
}

function intake(mocks = {}) {
  const mail = [];
  const store = dbMock(mocks.dbOverrides);
  const h = loader({
    "@/lib/db": { db: store.db },
    "./db": { db: store.db },
    "./mailer": {
      deliverNotice: async (input) => {
        mail.push(input);
        return mocks.deliver ?? { delivered: true, reason: "smtp" };
      },
    },
    env: mocks.env,
  });
  return { module: h.load("lib/contact-intake.ts"), mail, store };
}

const valid = {
  kind: "contact",
  name: "Ana Pérez",
  email: "Ana@Example.com",
  topic: "Ventas",
  target: "",
  body: "Quiero un plan de hosting para mi tienda.",
};

test("acepta un mensaje válido y normaliza el correo", () => {
  const { module } = intake();
  const parsed = module.parseContactInput(valid);
  assert.equal(parsed.email, "ana@example.com");
  assert.equal(parsed.kind, "contact");
  assert.equal(parsed.topic, "Ventas");
});

test("rechaza HTML, inyección de cabeceras, tema fuera de lista y cuerpo corto", () => {
  const { module } = intake();
  const cases = [
    { ...valid, name: "<b>Ana</b>" },
    { ...valid, body: "corto" },
    { ...valid, body: "Mensaje con <script>alert(1)</script> dentro del texto." },
    { ...valid, topic: "Otro departamento" },
    { ...valid, email: "no-es-un-correo" },
    { ...valid, kind: "otra-cosa" },
    "cadena",
    null,
    [valid],
  ];
  for (const input of cases) {
    assert.throws(
      () => module.parseContactInput(input),
      (error) => error.name === "ContactError" && error.status === 400,
      `debía rechazar: ${JSON.stringify(input)}`,
    );
  }
});

test("un intento de inyectar cabeceras de correo queda sin saltos de línea", () => {
  const { module } = intake();
  const parsed = module.parseContactInput({
    ...valid,
    name: "Ana\r\nBcc: otro@example.com",
  });
  // El nombre se acepta saneado, pero ningún CR/LF llega al asunto ni al cuerpo.
  assert.ok(!/[\r\n]/.test(parsed.name));
  assert.ok(!/[\r\n]/.test(module.noticeSubject(parsed)));
  assert.equal(module.noticeBody(parsed, "msg_1").split("\n")[2], "Email: ana@example.com");
});

test("el reporte de abuso exige dominio o IP y acepta las categorías del catálogo", () => {
  const { module } = intake();
  assert.throws(
    () => module.parseContactInput({ ...valid, kind: "abuse", topic: "Phishing", target: "" }),
    (error) => error.status === 400,
  );
  const parsed = module.parseContactInput({
    ...valid,
    kind: "abuse",
    topic: "Phishing",
    target: "malo.example.com",
    body: "Esta cuenta aloja una página falsa de banco.",
  });
  assert.equal(parsed.target, "malo.example.com");
  assert.match(module.noticeSubject(parsed), /^\[Abuso · Phishing\]/);
});

test("guarda el mensaje con la clave de cliente en HMAC, nunca la IP en claro", async () => {
  const { module, store } = intake();
  const result = await module.submitContactMessage(module.parseContactInput(valid), "203.0.113.9");
  assert.equal(result.id, "msg_1");
  const row = store.created[0];
  assert.equal(row.status, "new");
  assert.match(row.clientKey, /^[a-f0-9]{64}$/);
  assert.ok(!row.clientKey.includes("203.0.113.9"));
});

test("sin dirección de aviso el mensaje se guarda igual y no se marca entregado", async () => {
  const { module, mail, store } = intake();
  const result = await module.submitContactMessage(module.parseContactInput(valid), "k");
  assert.equal(mail.length, 0);
  assert.equal(result.delivered, false);
  assert.equal(result.notifiable, false);
  assert.equal(store.created.length, 1);
});

test("con dirección de aviso envía con reply-to del cliente y marca entregado", async () => {
  const { module, mail, store } = intake({
    dbOverrides: {
      siteSetting: {
        findUnique: async () => ({ key: "contact", value: { email: "ventas@example.com" } }),
      },
    },
  });
  const result = await module.submitContactMessage(module.parseContactInput(valid), "k");
  assert.equal(mail[0].to, "ventas@example.com");
  assert.equal(mail[0].replyTo, "ana@example.com");
  assert.equal(result.delivered, true);
  assert.equal(store.updated.length, 1);
});

test("un SMTP caído no pierde el mensaje", async () => {
  const store = dbMock({
    siteSetting: {
      findUnique: async () => ({ key: "contact", value: { email: "ventas@example.com" } }),
    },
  });
  const h = loader({
    "./db": { db: store.db },
    "./mailer": {
      deliverNotice: async () => {
        throw new Error("smtp caído");
      },
    },
  });
  const module = h.load("lib/contact-intake.ts");
  const result = await module.submitContactMessage(module.parseContactInput(valid), "k");
  assert.equal(result.delivered, false);
  assert.equal(store.created.length, 1);
});

/* ------------------------------- la ruta pública ------------------------------- */

function request(body, { origin = "https://caluservers.com", host = "caluservers.com" } = {}) {
  return new NextRequest("https://caluservers.com/api/contact", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      ...(host ? { host } : {}),
    },
    body: JSON.stringify(body),
  });
}

function route(mocks = {}) {
  const h = loader({
    "@/lib/contact-intake": {
      ContactError: class ContactError extends Error {
        constructor(message, status) {
          super(message);
          this.name = "ContactError";
          this.status = status;
        }
      },
      parseContactInput: mocks.parse ?? ((value) => value),
      submitContactMessage:
        mocks.submit ?? (async () => ({ id: "msg_1", delivered: true, notifiable: true })),
    },
    "@/lib/request": { trustedWrite: mocks.trustedWrite ?? (() => true) },
    "@/lib/login-rate-limit": { clientRateKey: () => "key" },
    "@/lib/request-throttle": {
      consumeRequest:
        mocks.consume ?? (async () => ({ allowed: true, retryAfterSec: 0 })),
    },
    env: mocks.env,
  });
  return h.load("app/api/contact/route.ts");
}

test("la ruta exige el mismo origen", async () => {
  const api = route({ trustedWrite: () => false });
  const response = await api.POST(request(valid, { origin: "" }));
  assert.equal(response.status, 403);
});

test("sin contador compartido la ruta no acepta el mensaje", async () => {
  let submitted = 0;
  const api = route({
    consume: async () => {
      throw new Error("falta la tabla RequestThrottle");
    },
    submit: async () => {
      submitted += 1;
      return { id: "x", delivered: true, notifiable: true };
    },
  });
  const response = await api.POST(request(valid));
  assert.equal(response.status, 503);
  assert.equal(submitted, 0);
});

test("pasado el límite responde 429 con Retry-After y no guarda", async () => {
  let submitted = 0;
  const api = route({
    consume: async () => ({ allowed: false, retryAfterSec: 120 }),
    submit: async () => {
      submitted += 1;
      return { id: "x", delivered: true, notifiable: true };
    },
  });
  const response = await api.POST(request(valid));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "120");
  assert.equal(submitted, 0);
});

test("un fallo de base responde 503 y nunca dice que se envió", async () => {
  const api = route({
    submit: async () => {
      throw Object.assign(new Error("db"), { code: "P2021" });
    },
  });
  const response = await api.POST(request(valid));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.ok(!/enviado|recibido/i.test(body.error));
});

test("un cuerpo enorme se corta antes de validar", async () => {
  const api = route();
  const response = await api.POST(request({ ...valid, body: "x".repeat(20000) }));
  assert.equal(response.status, 413);
});

test("el éxito informa si el aviso por correo salió o no", async () => {
  const sent = await route().POST(request(valid));
  assert.equal(sent.status, 200);
  assert.equal((await sent.json()).delivered, true);

  const stored = await route({
    submit: async () => ({ id: "msg_2", delivered: false, notifiable: false }),
  }).POST(request(valid));
  const body = await stored.json();
  assert.equal(body.ok, true);
  assert.equal(body.delivered, false);
  assert.match(body.message, /guardado/i);
});
