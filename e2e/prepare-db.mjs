import { execFileSync } from "node:child_process";
import pg from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL es obligatorio para las pruebas de navegador");
  process.exit(1);
}
const url = new URL(source);
url.pathname = "/caluservers_e2e";
const admin = new pg.Client({ connectionString: source });
await admin.connect();
await admin.query(
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'caluservers_e2e' AND pid <> pg_backend_pid()",
);
await admin.query("DROP DATABASE IF EXISTS caluservers_e2e");
await admin.query("CREATE DATABASE caluservers_e2e");
await admin.end();
execFileSync("npx", ["prisma", "migrate", "deploy"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: url.toString() },
  stdio: "inherit",
});
