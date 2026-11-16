-- Contraseña inicial de cPanel aleatoria por servicio, guardada cifrada
-- (AES-256-GCM con AAD propio, lib/secret-box.ts). Antes era determinista
-- (HMAC con AUTH_SECRET) y no se guardaba: un reintento tras una respuesta
-- perdida la regeneraba. Ahora se genera una sola vez al provisionar, se
-- cifra antes de llamar a WHM y se descifra en servidor solo para
-- mostrarla a su dueño o al admin. Si se re-adopta una cuenta ya creada
-- (respuesta perdida), la contraseña guardada es la de ese mismo intento,
-- que es la que recibió WHM, así que no se genera otra.
-- Aditiva: los servicios dados de alta antes de este cambio quedan con
-- NULL y muestran "no disponible" en el panel hasta que se restablezca
-- su contraseña en WHM.

ALTER TABLE "CustomerService" ADD COLUMN "cpanelPasswordEncrypted" TEXT;
