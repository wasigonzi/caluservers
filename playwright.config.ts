import { defineConfig, devices } from "@playwright/test";
import {
  E2E_AUTH_SECRET,
  E2E_EMAIL,
  E2E_PASSWORD_HASH,
  E2E_SETTINGS_KEY,
  e2eDatabaseUrl,
} from "./e2e/fixtures";

const baseURL = "http://127.0.0.1:3011";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: { baseURL, locale: "es-ES" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev --hostname 127.0.0.1 --port 3011",
    url: `${baseURL}/admin/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ? e2eDatabaseUrl() : "",
      ADMIN_EMAIL: E2E_EMAIL,
      ADMIN_PASSWORD_HASH: E2E_PASSWORD_HASH,
      AUTH_SECRET: E2E_AUTH_SECRET,
      SETTINGS_ENCRYPTION_KEY: E2E_SETTINGS_KEY,
      WHMCS_ALLOWED_HOST: "client.caluservers.com",
      NEXT_PUBLIC_SITE_URL: baseURL,
      BLOB_READ_WRITE_TOKEN: "",
      ADMIN_TOTP_SECRET: "",
      BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
      BETTER_AUTH_URL: baseURL,
      BILLING_CURRENCY: "USD",
      TAX_MODE: "",
      PAYPAL_MODE: "sandbox",
      PAYPAL_SANDBOX_FIXTURE: "local",
      PAYPAL_SANDBOX_TEST_FISCAL: "isolated",
      PAYPAL_SANDBOX_WEBHOOK_ID: "wh-local-fixture",
      MAIL_SINK_DIR: "/tmp/calu-mail-e2e",
      MAIL_FROM: "no-reply@example.com",
    },
  },
});
