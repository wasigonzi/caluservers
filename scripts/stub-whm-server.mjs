// Stub WHM local SOLO para pruebas end-to-end (scripts/e2e-provisioning.mjs).
// NUNCA se despliega: vive en scripts/, fuera de app/. Escucha solo en
// 127.0.0.1 y registra cada createacct (método, parámetros) devolviendo
// respuestas con el formato real de WHM (metadata.result/command/version).
// La contraseña NUNCA sale por /__test__/calls: se devuelve redactada.
import http from "node:http";

const PORT = Number(process.env.STUB_PORT || "18087");
const PACKAGES = ["Calu Starter", "Calu Professional", "Calu Business"];

const accounts = new Map(); // username -> { domain, plan }
const calls = []; // { method, path, params (password redactado), at }
let mode = { failCreate: false, dropCreate: false, failReason: "" };

function whmResponse(res, command, result, data, reason) {
  const body = JSON.stringify({
    metadata: { result, command, version: 1, ...(reason ? { reason } : {}) },
    data,
  });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(body);
}

function redactParams(params) {
  const out = { ...params };
  if (typeof out.password === "string")
    out.password = `<redacted:${out.password.length} chars>`;
  return out;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/__test__/calls") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        calls,
        accounts: [...accounts.entries()].map(([user, a]) => ({
          user,
          domain: a.domain,
          plan: a.plan,
        })),
        mode,
      }),
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/__test__/reset") {
    accounts.clear();
    calls.length = 0;
    mode = { failCreate: false, dropCreate: false, failReason: "" };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/__test__/mode") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        const next = JSON.parse(raw || "{}");
        mode = { ...mode, ...next };
      } catch {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, mode }));
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/json-api/listaccts") {
    whmResponse(res, "listaccts", 1, {
      acct: [...accounts.entries()].map(([user, a]) => ({
        user,
        domain: a.domain,
        plan: a.plan,
        suspended: "0",
        diskused: "0",
        disklimit: "0",
      })),
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/json-api/listpkgs") {
    whmResponse(res, "listpkgs", 1, {
      pkg: PACKAGES.map((name) => ({
        name,
        QUOTA: "51200",
        BWLIMIT: "unlimited",
        MAXPOP: "unlimited",
        MAXSQL: "unlimited",
      })),
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/json-api/createacct") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const params = Object.fromEntries(new URLSearchParams(raw));
      calls.push({
        method: "POST",
        path: "/json-api/createacct",
        params: redactParams(params),
        at: new Date().toISOString(),
      });
      console.log(
        `[stub-whm] createacct username=${params.username} domain=${params.domain} plan=${params.plan}`,
      );
      if (mode.dropCreate) {
        // La cuenta SÍ se crea, pero la respuesta se pierde (caso "incierto").
        accounts.set(params.username, {
          domain: params.domain,
          plan: params.plan,
        });
        req.socket.destroy();
        return;
      }
      if (mode.failCreate) {
        whmResponse(
          res,
          "createacct",
          0,
          {},
          mode.failReason || "Simulated WHM failure",
        );
        return;
      }
      if (accounts.has(params.username)) {
        whmResponse(
          res,
          "createacct",
          0,
          {},
          "The account already exists",
        );
        return;
      }
      accounts.set(params.username, {
        domain: params.domain,
        plan: params.plan,
      });
      whmResponse(res, "createacct", 1, {});
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[stub-whm] listening on http://127.0.0.1:${PORT}`);
});
