# CaluServers · Next.js / Node.js / WHMCS

Nueva aplicación Next.js 15 con TypeScript, Tailwind CSS, dashboard glassmorphism y consultas reales a WHMCS. La rama main permanece sin cambios.

## Configuración

1. Node.js 20.9+ y PostgreSQL. Ejecutar npm install.
2. Copiar .env.example a .env.local. Rellenar DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, AUTH_SECRET, SETTINGS_ENCRYPTION_KEY y WHMCS_ALLOWED_HOST.
3. Ejecutar npm run admin:hash para crear el hash scrypt de la contraseña de administrador.
4. AUTH_SECRET debe tener al menos 32 caracteres aleatorios. SETTINGS_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales aleatorios; guárdala en lugar seguro.
5. Ejecutar npx prisma db push, luego npm run dev.
6. Entrar en /admin/login y /admin/settings e introducir WHMCS URL, API Identifier y API Secret creados con un rol de permisos mínimos dentro de WHMCS.
7. Configurar en WHMCS permiso de acceso a API según IP y rol. Verificar tráfico saliente desde el hosting.

## Seguridad y limitaciones

No se almacenan secretos en el navegador ni en GitHub. Se cifran con AES-256-GCM en PostgreSQL y solo se utilizan en el servidor. Las consultas admitidas son GetClients, GetOrders, GetInvoices, GetProducts, GetTickets y GetClientsProducts. El portal de cobro sigue en WHMCS. Esta primera fase no modifica pedidos, no aprovisiona servicios ni realiza cobros. Añadir MFA y limitación distribuida de intentos de acceso antes de producción. No se ha conectado a una cuenta real ni se han verificado credenciales. La migración de todas las páginas antiguas y pruebas de build/despliegue sigue pendiente.
