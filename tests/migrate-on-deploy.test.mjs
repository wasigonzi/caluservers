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
  assert.equal(plan.apply.length, 3);
  assert.equal(plan.skipped.length, 0);
});

test("de un ALTER TABLE mixto solo quedan las altas", () => {
  const plan = additivePlan(`ALTER TABLE "CustomerService" ADD COLUMN     "cpanelUser" TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ADD COLUMN     "provisionError" TEXT,
DROP COLUMN "viejo";
`);
  assert.deepEqual(plan.apply, [
    'ALTER TABLE "CustomerService" ADD COLUMN     "cpanelUser" TEXT,\nADD COLUMN     "provisionError" TEXT',
  ]);
  assert.equal(plan.skipped.length, 2);
});

test("lo que no añade nunca llega a la lista de aplicar", () => {
  for (const sql of [
    'ALTER TABLE "AdminAudit" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);',
    'ALTER TABLE "user" DROP COLUMN "email";',
    'DROP TABLE "otra_app";',
    'DROP INDEX "user_email_key";',
    'ALTER TABLE "a" RENAME TO "b";',
    'DELETE FROM "user";',
    'UPDATE "user" SET "name" = \'x\';',
    'CREATE TABLE "X" AS SELECT 1; DROP TABLE "user";',
  ]) {
    const plan = additivePlan(sql);
    assert.deepEqual(plan.apply, [], sql);
    assert.ok(plan.skipped.length >= 1, sql);
  }
});
