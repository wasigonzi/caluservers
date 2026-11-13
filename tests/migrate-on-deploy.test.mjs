import test from "node:test";
import assert from "node:assert/strict";
import { sessionPoolerUrl } from "../scripts/migrate-on-deploy.mjs";

// Credenciales y hosts de estas pruebas son señuelos.
test("el pooler de Supabase en modo transacción pasa a modo sesión", () => {
  assert.equal(
    sessionPoolerUrl("postgresql://postgres.ref:clave@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"),
    "postgresql://postgres.ref:clave@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
  );
});

test("otras URL no se reescriben", () => {
  assert.equal(sessionPoolerUrl("postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres"), null);
  assert.equal(sessionPoolerUrl("postgresql://u:p@db.example.com:6543/app"), null);
  assert.equal(sessionPoolerUrl("https://aws-0-us-east-1.pooler.supabase.com:6543/x"), null);
  assert.equal(sessionPoolerUrl("no es una url"), null);
  assert.equal(sessionPoolerUrl(""), null);
});
