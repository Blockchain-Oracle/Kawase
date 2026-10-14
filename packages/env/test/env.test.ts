import assert from "node:assert/strict";
import { test } from "node:test";

import { loadApiEnv, loadPrivyEnv } from "../src/index";

const HEX_KEY = "0x" + "ab".repeat(32);
const PUBLIC_KEY = "02" + "cd".repeat(32);
const base = {
  DATABASE_URL: "postgres://kawase:kawase@localhost:5433/kawase",
  TURNKEY_ORGANIZATION_ID: "bb8f314c-c99b-4b41-995a-47c9d0bca23e",
  TURNKEY_API_PUBLIC_KEY: PUBLIC_KEY,
  TURNKEY_API_PRIVATE_KEY: HEX_KEY,
  CIRCLE_TEST_API_KEY: "TEST_API_KEY:x:y",
  CIRCLE_TEST_ENTITY_SECRET: "secret",
  RELAYER_PRIVATE_KEY_TESTNET: HEX_KEY,
  OPS_WALLET_ID_TESTNET: "wallet-id",
  OPS_WALLET_ADDRESS_TESTNET: "0x2d9b5452178316e064d10e1424e8acf65a71b6b9",
};

test("loads the api environment with defaults", () => {
  const env = loadApiEnv(base);
  assert.equal(env.PORT, 3000);
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.MAINNET_ENABLED, false);
  assert.equal(env.TURNKEY_API_BASE_URL, "https://api.turnkey.com");
});

test("names every missing or malformed variable", () => {
  assert.throws(
    () => loadApiEnv({ ...base, DATABASE_URL: "nope", TURNKEY_API_PUBLIC_KEY: "short" }),
    (error: Error) => error.message.includes("DATABASE_URL") && error.message.includes("TURNKEY_API_PUBLIC_KEY"),
  );
});

test("mainnet needs the live keys", () => {
  assert.throws(() => loadApiEnv({ ...base, MAINNET_ENABLED: "true" }), /RELAYER_PRIVATE_KEY_MAINNET/);
  const env = loadApiEnv({
    ...base,
    MAINNET_ENABLED: "true",
    CIRCLE_LIVE_API_KEY: "LIVE",
    CIRCLE_LIVE_ENTITY_SECRET: "s",
    RELAYER_PRIVATE_KEY_MAINNET: HEX_KEY,
    OPS_WALLET_ID_MAINNET: "w",
    OPS_WALLET_ADDRESS_MAINNET: "0x2d9b5452178316e064d10e1424e8acf65a71b6b9",
  });
  assert.equal(env.MAINNET_ENABLED, true);
});

test("Privy is off by default and needs its app id when chosen (D41)", () => {
  assert.equal(loadApiEnv(base).WALLET_PROVIDER, "turnkey");
  assert.throws(() => loadApiEnv({ ...base, WALLET_PROVIDER: "privy" }), /PRIVY_APP_ID/);
  const env = loadApiEnv({
    ...base,
    WALLET_PROVIDER: "privy",
    PRIVY_APP_ID: "app-id",
    PRIVY_VERIFICATION_KEY: "-----BEGIN PUBLIC KEY-----\\nABC\\n-----END PUBLIC KEY-----",
    PRIVY_APP_SECRET: "",
  });
  assert.equal(env.PRIVY_VERIFICATION_KEY, "-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----");
  assert.equal(env.PRIVY_APP_SECRET, undefined);
  assert.equal(loadPrivyEnv({ WALLET_PROVIDER: "privy", PRIVY_APP_ID: "app-id" }).PRIVY_APP_ID, "app-id");
  assert.throws(() => loadPrivyEnv({ WALLET_PROVIDER: "privy" }), /PRIVY_APP_ID/);
});
