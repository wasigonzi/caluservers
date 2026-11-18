-- Valor por defecto para rellenar pedidos existentes al añadir la columna
-- en una base con datos (migrate diff genera ADD COLUMN ... NOT NULL DEFAULT
-- y ya no falla por la restricción NOT NULL). La aplicación sigue poniendo
-- su propio token (48 hex) al crear cada pedido.
ALTER TABLE "CustomerOrder" ALTER COLUMN "trackingToken" SET DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
