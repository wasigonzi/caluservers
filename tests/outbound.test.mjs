// Cliente HTTPS de salida. Hosts, IPs y respuestas son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { loader } from "./helpers/load.mjs";

/** Doble de node:https que devuelve un estado y un cuerpo fijos. */
function httpsMock({ status = 200, body = "{}", chunks, fail = false, stall = false } = {}) {
  const calls = [];
  return {
    calls,
    module: {
      request(url, options, handler) {
        const req = new EventEmitter();
        req.destroy = () => {
          req.emit("close");
        };
        req.write = (payload) => {
          calls.push({ url: String(url), options, payload: payload.toString("utf8") });
        };
        req.end = () => {
          if (!calls.length || calls[calls.length - 1].url !== String(url)) {
            calls.push({ url: String(url), options, payload: "" });
          }
          if (fail) {
            setImmediate(() => req.emit("error", new Error("red")));
            return;
          }
          if (stall) return;
          const res = new EventEmitter();
          res.statusCode = status;
          res.destroy = () => {};
          setImmediate(() => {
            handler(res);
            for (const chunk of chunks ?? [Buffer.from(body, "utf8")]) res.emit("data", chunk);
            res.emit("end");
          });
        };
        return req;
      },
    },
  };
}

function build(mocks = {}) {
  const https = httpsMock(mocks.https);
  const h = loader({
    "node:https": https.module,
    "node:dns/promises": {
      lookup: async () => mocks.dns ?? [{ address: "8.8.8.8", family: 4 }],
    },
    env: mocks.env,
    setTimeout: mocks.setTimeout,
  });
  return { outbound: h.load("lib/outbound.ts"), https };
}

test("solo https, sin credenciales ni fragmento", () => {
  const { outbound } = build();
  for (const url of [
    "http://api.example.com/x",
    "https://user:pass@api.example.com/x",
    "https://api.example.com/x#frag",
    "ftp://api.example.com/x",
    "https://api.example.com/\u0000",
  ]) {
    assert.throws(
      () => outbound.assertOutboundUrl(url, ["api.example.com"]),
      (error) => error.name === "OutboundError" && error.code === "invalid",
      url,
    );
  }
  assert.equal(
    outbound.assertOutboundUrl("https://api.example.com/x", ["api.example.com"]).hostname,
    "api.example.com",
  );
});

test("un host fuera de la lista se bloquea antes de resolver DNS", async () => {
  const { outbound, https } = build();
  await assert.rejects(
    outbound.requestJson({
      url: "https://otro.example.net/x",
      method: "GET",
      allowHosts: ["api.example.com"],
    }),
    (error) => error.code === "blocked",
  );
  assert.equal(https.calls.length, 0);
});

test("una lista vacía no autoriza nada", () => {
  const { outbound } = build();
  assert.throws(
    () => outbound.assertOutboundUrl("https://api.example.com/x", []),
    (error) => error.code === "blocked",
  );
});

test("una respuesta DNS privada o mixta se rechaza", async () => {
  for (const dns of [
    [{ address: "127.0.0.1", family: 4 }],
    [{ address: "10.1.2.3", family: 4 }],
    [{ address: "169.254.1.1", family: 4 }],
    [{ address: "8.8.8.8", family: 4 }, { address: "192.168.1.5", family: 4 }],
    [],
  ]) {
    const { outbound, https } = build({ dns });
    await assert.rejects(
      outbound.requestJson({
        url: "https://api.example.com/x",
        method: "GET",
        allowHosts: ["api.example.com"],
      }),
      (error) => error.code === "blocked",
    );
    assert.equal(https.calls.length, 0);
  }
});

test("la conexión se fija a la dirección validada y no vuelve a resolver", async () => {
  const { outbound, https } = build();
  await outbound.requestJson({
    url: "https://api.example.com/x",
    method: "GET",
    allowHosts: ["api.example.com"],
  });
  const { options } = https.calls[0];
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.agent, false);
  let pinned = null;
  options.lookup("api.example.com", {}, (error, address, family) => {
    pinned = { error, address, family };
  });
  assert.deepEqual(pinned, { error: null, address: "8.8.8.8", family: 4 });
});

test("una redirección se devuelve, no se sigue", async () => {
  const { outbound, https } = build({
    https: { status: 302, body: "" },
  });
  const result = await outbound.requestJson({
    url: "https://api.example.com/x",
    method: "GET",
    allowHosts: ["api.example.com"],
  });
  assert.equal(result.status, 302);
  assert.equal(result.json, null);
  assert.equal(https.calls.length, 1);
});

test("un cuerpo mayor que el límite falla y no se analiza", async () => {
  const { outbound } = build({
    https: { chunks: [Buffer.alloc(40), Buffer.alloc(40)] },
  });
  await assert.rejects(
    outbound.requestJson({
      url: "https://api.example.com/x",
      method: "GET",
      allowHosts: ["api.example.com"],
      bodyLimit: 50,
    }),
    (error) => error.code === "response",
  );
});

test("un JSON ilegible no rompe: json queda en null con su estado", async () => {
  const { outbound } = build({ https: { status: 200, body: "no es json" } });
  const result = await outbound.requestJson({
    url: "https://api.example.com/x",
    method: "GET",
    allowHosts: ["api.example.com"],
  });
  assert.equal(result.status, 200);
  assert.equal(result.json, null);
});

test("un error de red se traduce sin exponer el mensaje original", async () => {
  const { outbound } = build({ https: { fail: true } });
  await assert.rejects(
    outbound.requestJson({
      url: "https://api.example.com/x",
      method: "GET",
      allowHosts: ["api.example.com"],
    }),
    (error) => error.code === "network" && !/red/.test(error.message),
  );
});

test("el POST manda el cuerpo con su Content-Length y la cabecera indicada", async () => {
  const { outbound, https } = build();
  await outbound.requestJson({
    url: "https://api.example.com/token",
    method: "POST",
    allowHosts: ["api.example.com"],
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const call = https.calls[0];
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(call.options.headers["Content-Length"], "29");
  assert.equal(call.payload, "grant_type=client_credentials");
});

test("el plazo corta la petición", async () => {
  const timers = [];
  const { outbound } = build({
    https: { stall: true },
    setTimeout: (fn) => {
      timers.push(fn);
      return 0;
    },
  });
  const pending = outbound.requestJson({
    url: "https://api.example.com/x",
    method: "GET",
    allowHosts: ["api.example.com"],
    timeoutMs: 10,
  });
  for (const fn of timers) fn();
  await assert.rejects(pending, (error) => error.code === "timeout");
});
