// Talks to Turnkey with the parent organization's API key. Skipped when the key is not in the root .env.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import { TurnkeyClient } from "@turnkey/http";
import { config } from "dotenv";

import { createTurnkeyReader } from "../src/auth/turnkey";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const env = process.env;
const live = Boolean(env.TURNKEY_API_PRIVATE_KEY && env.TURNKEY_API_PUBLIC_KEY && env.TURNKEY_ORGANIZATION_ID);
// The sub-organization created by spike 16 from the simulator.
const SPIKE_EMAIL = "kawase-spike16-a9jgx9@uberip.com";
const SPIKE_WALLET = "0x2B3fb337797ED2A7894aa1271940756A208f4e0D";

test("the parent organization can read a user's session keys and wallet addresses", { skip: !live }, async () => {
  const baseUrl = env.TURNKEY_API_BASE_URL ?? "https://api.turnkey.com";
  const client = new TurnkeyClient(
    { baseUrl },
    new ApiKeyStamper({ apiPublicKey: env.TURNKEY_API_PUBLIC_KEY!, apiPrivateKey: env.TURNKEY_API_PRIVATE_KEY! }),
  );
  const { organizationIds } = await client.getSubOrgIds({
    organizationId: env.TURNKEY_ORGANIZATION_ID!,
    filterType: "EMAIL",
    filterValue: SPIKE_EMAIL,
  });
  assert.equal(organizationIds.length, 1, "one sub-organization for the spike email");
  const subOrg = organizationIds[0]!;
  const { users } = await client.getUsers({ organizationId: subOrg });
  const user = users.find((u) => u.userEmail === SPIKE_EMAIL);
  assert.ok(user, "the spike user exists");

  const reader = createTurnkeyReader({
    baseUrl,
    apiPublicKey: env.TURNKEY_API_PUBLIC_KEY!,
    apiPrivateKey: env.TURNKEY_API_PRIVATE_KEY!,
  });
  const read = await reader.getUser(subOrg, user.userId);
  assert.ok(read);
  assert.equal(read.email, SPIKE_EMAIL);
  assert.ok(read.sessionPublicKeys.length >= 1, "the simulator's session key is registered on the user");
  assert.equal(await reader.getUser(subOrg, "00000000-0000-0000-0000-000000000000"), undefined);

  const addresses = await reader.getWalletAddresses(subOrg);
  assert.ok(
    addresses.some((a) => a.address.toLowerCase() === SPIKE_WALLET.toLowerCase()),
    "the spike wallet is listed",
  );
});
