import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/plugins/two-factor";

export const customerAuthClient = createAuthClient({
  plugins: [passkeyClient(), twoFactorClient()],
});
