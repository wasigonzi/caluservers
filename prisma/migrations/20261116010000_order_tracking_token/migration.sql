-- Token público de seguimiento del pedido. La página /pedido/[token] solo
-- muestra plan, dominio, estados y fecha: nunca contraseñas, correo ni pagos.
-- Aditiva: rellena los pedidos existentes con un token aleatorio
-- (64 hex, dos UUID sin guiones; los nuevos son 48 hex).

ALTER TABLE "CustomerOrder" ADD COLUMN "trackingToken" TEXT;

UPDATE "CustomerOrder"
SET "trackingToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "trackingToken" IS NULL;

ALTER TABLE "CustomerOrder" ALTER COLUMN "trackingToken" SET NOT NULL;

CREATE UNIQUE INDEX "CustomerOrder_trackingToken_key" ON "CustomerOrder"("trackingToken");
