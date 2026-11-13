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

const { additivePlan } = await import("../scripts/migrate-on-deploy.mjs");

test("un guion que solo añade se acepta entero", () => {
  const plan = additivePlan(`-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CustomerService" ADD COLUMN     "cpanelUser" TEXT,
ADD COLUMN     "provisionAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerService_cpanelUser_key" ON "CustomerService"("cpanelUser");
`);
  assert.equal(plan.ok, true);
  assert.equal(plan.apply.length, 3);
});

test("borrar una tabla ajena se ignora, no se ejecuta", () => {
  const plan = additivePlan(`DROP TABLE "otra_app";\n\nCREATE TABLE "X" ("id" TEXT NOT NULL);\n`);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.skipped, ['DROP TABLE "otra_app"']);
  assert.equal(plan.apply.length, 1);
});

test("cualquier cambio que no sea añadir lo rechaza todo", () => {
  for (const sql of [
    'ALTER TABLE "user" DROP COLUMN "email";',
    'ALTER TABLE "user" ALTER COLUMN "name" SET NOT NULL;',
    'ALTER TABLE "user" ADD COLUMN "a" TEXT,\nDROP COLUMN "b";',
    'DROP INDEX "user_email_key";',
    'ALTER TABLE "a" RENAME TO "b";',
    'CREATE TABLE "X" ("id" TEXT);\nDELETE FROM "user";',
    'UPDATE "user" SET "name" = \'x\';',
  ]) {
    const plan = additivePlan(sql);
    assert.equal(plan.ok, false, sql);
    assert.equal(plan.apply.length, 0);
  }
});
