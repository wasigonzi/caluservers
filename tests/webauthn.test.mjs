// WebAuthn del administrador (Fase 1, tramo C): retos de un solo uso,
// contador anti-clonación, RP derivado del entorno y rechazo de una
// credencial falsa con la librería real (@simplewebauthn/server).
// No hay ceremonia real de navegador aquí: eso queda sin verificar.
import test from "node:test";
import assert from "node:assert/strict";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { loader } from "./helpers/load.mjs";

const fakeDb = {
  adminUser: { findFirst: async () => null },
  passkeyCredential: {
    findUnique: async () => null,
    findMany: async () => [],
    upsert: async () => ({}),
    update: async () => ({}),
  },
  webauthnChallenge: {
    create: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
  },
};

function loadWebauthn(env = {}) {
  const h = loader({ "@/lib/db": { db: fakeDb }, env });
  return h.load("lib/webauthn.ts");
}

test("un reto vale una sola vez: el segundo consumo se rechaza", async () => {
  const webauthn = loadWebauthn();
  const store = webauthn.memoryChallengeStore();
  await webauthn.issueChallenge(store, "register", "admin-1", "reto-abc");
  assert.equal(await webauthn.consumeChallenge(store, "register", "admin-1", "reto-abc"), true);
  assert.equal(await webauthn.consumeChallenge(store, "register", "admin-1", "reto-abc"), false);
  assert.equal(store.size(), 0);
});

test("un reto caducado se rechaza y no queda reutilizable", async () => {
  const webauthn = loadWebauthn();
  const store = webauthn.memoryChallengeStore();
  await webauthn.issueChallenge(store, "register", "admin-1", "reto-viejo", -1000);
  assert.equal(await webauthn.consumeChallenge(store, "register", "admin-1", "reto-viejo"), false);
});

test("el reto está ligado a su propósito: uno de registro no vale para autenticar", async () => {
  const webauthn = loadWebauthn();
  const store = webauthn.memoryChallengeStore();
  await webauthn.issueChallenge(store, "register", "admin-1", "reto-xyz");
  assert.equal(await webauthn.consumeChallenge(store, "authenticate", "admin-1", "reto-xyz"), false);
  assert.equal(await webauthn.consumeChallenge(store, "register", "admin-1", "reto-xyz"), true);
});

test("el contador debe avanzar: igual o menor se rechaza, sin contador (0/0) pasa", () => {
  const webauthn = loadWebauthn();
  assert.equal(webauthn.counterAdvances(5, 6), true);
  assert.equal(webauthn.counterAdvances(5, 5), false);
  assert.equal(webauthn.counterAdvances(5, 4), false);
  // Autenticador sin contador: siempre 0.
  assert.equal(webauthn.counterAdvances(0, 0), true);
  // El contador desaparece: posible clonación.
  assert.equal(webauthn.counterAdvances(5, 0), false);
  assert.equal(webauthn.counterAdvances(0, 3), true);
});

test("RP ID: WEBAUTHN_RP_ID manda; si no, el host de BETTER_AUTH_URL; si no, localhost", () => {
  const explicit = loadWebauthn({
    WEBAUTHN_RP_ID: "caluservers.com",
    BETTER_AUTH_URL: "https://otro.example",
  });
  assert.equal(explicit.webauthnRpId(), "caluservers.com");
  const derived = loadWebauthn({ BETTER_AUTH_URL: "https://caluservers.com" });
  assert.equal(derived.webauthnRpId(), "caluservers.com");
  assert.equal(derived.webauthnRpName(), "CaluServers");
  assert.equal(derived.webauthnOrigin(), "https://caluservers.com");
  const fallback = loadWebauthn({});
  assert.equal(fallback.webauthnRpId(), "localhost");
  const named = loadWebauthn({ WEBAUTHN_RP_NAME: "Mi Sitio" });
  assert.equal(named.webauthnRpName(), "Mi Sitio");
});

test("una credencial falsa no verifica: la librería la rechaza", async () => {
  const fake = {
    id: "AAAAAAAAAAAAAAAAAAAAAA",
    rawId: "AAAAAAAAAAAAAAAAAAAAAA",
    type: "public-key",
    response: {
      clientDataJSON: Buffer.from(
        JSON.stringify({
          type: "webauthn.create",
          challenge: "AAAAAAAAAAAAAAAAAAAAAA",
          origin: "http://localhost:3000",
        }),
      ).toString("base64url"),
      attestationObject: Buffer.from("AAAAAAAA").toString("base64url"),
      transports: [],
    },
  };
  let verified = false;
  try {
    const result = await verifyRegistrationResponse({
      response: fake,
      expectedChallenge: "AAAAAAAAAAAAAAAAAAAAAA",
      expectedOrigin: "http://localhost:3000",
      expectedRPID: "localhost",
    });
    verified = result.verified;
  } catch {
    // Rechazo por excepción también vale: nunca verifica.
    verified = false;
  }
  assert.equal(verified, false);
});

test("verifyAdminRegistration con credencial falsa devuelve verified:false", async () => {
  const webauthn = loadWebauthn({ BETTER_AUTH_URL: "http://localhost:3000" });
  const fake = {
    id: "AAAAAAAAAAAAAAAAAAAAAA",
    rawId: "AAAAAAAAAAAAAAAAAAAAAA",
    type: "public-key",
    response: {
      clientDataJSON: Buffer.from(
        JSON.stringify({
          type: "webauthn.create",
          challenge: "AAAAAAAAAAAAAAAAAAAAAA",
          origin: "http://localhost:3000",
        }),
      ).toString("base64url"),
      attestationObject: Buffer.from("AAAAAAAA").toString("base64url"),
      transports: [],
    },
  };
  const result = await webauthn.verifyAdminRegistration(
    { email: "admin@example.com" },
    fake,
  );
  assert.equal(result.verified, false);
});

test("verifyAdminAuthentication con credencial desconocida se rechaza sin tocar la BD", async () => {
  const webauthn = loadWebauthn({ BETTER_AUTH_URL: "http://localhost:3000" });
  let updates = 0;
  const strictDb = {
    ...fakeDb,
    passkeyCredential: {
      ...fakeDb.passkeyCredential,
      update: async () => {
        updates += 1;
        return {};
      },
    },
  };
  const h = loader({ "@/lib/db": { db: strictDb }, env: { BETTER_AUTH_URL: "http://localhost:3000" } });
  const strict = h.load("lib/webauthn.ts");
  const result = await strict.verifyAdminAuthentication("admin@example.com", {
    id: "credencial-que-no-existe",
    rawId: "credencial-que-no-existe",
    type: "public-key",
    response: {
      clientDataJSON: "",
      authenticatorData: "",
      signature: "",
      userHandle: "",
    },
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, "unknown-credential");
  assert.equal(updates, 0);
});
