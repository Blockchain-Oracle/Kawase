import assert from "node:assert/strict";
import { test } from "node:test";

import { loadApiEnv, loadPrivyEnv } from "../src/index";

const HEX_KEY = "0x" + "ab".repeat(32);
const base = {
  DATABASE_URL: "postgres://kawase:kawase@localhost:5433/kawase",
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
  assert.equal(env.PRIVY_APP_ID, undefined);
});

test("names every missing or malformed variable", () => {
  assert.throws(
    () => loadApiEnv({ ...base, DATABASE_URL: "nope", RELAYER_PRIVATE_KEY_TESTNET: "short" }),
    (error: Error) => error.message.includes("DATABASE_URL") && error.message.includes("RELAYER_PRIVATE_KEY_TESTNET"),
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

test("Privy's keys load, a blank secret is unset, and production needs the app id (D41)", () => {
  const env = loadApiEnv({
    ...base,
    PRIVY_APP_ID: "app-id",
    PRIVY_VERIFICATION_KEY: "-----BEGIN PUBLIC KEY-----\\nABC\\n-----END PUBLIC KEY-----",
    PRIVY_APP_SECRET: "",
  });
  assert.equal(env.PRIVY_VERIFICATION_KEY, "-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----");
  assert.equal(env.PRIVY_APP_SECRET, undefined);
  assert.equal(loadPrivyEnv({ PRIVY_APP_ID: "app-id" }).PRIVY_APP_ID, "app-id");
  assert.equal(loadPrivyEnv({}).PRIVY_APP_ID, undefined);
  assert.throws(() => loadApiEnv({ ...base, NODE_ENV: "production", AGENT_APPROVAL_SECRET: "s".repeat(32) }), /PRIVY_APP_ID/);
});

test("production needs the approval secret", () => {
  assert.throws(() => loadApiEnv({ ...base, NODE_ENV: "production" }), /AGENT_APPROVAL_SECRET/);
  const env = loadApiEnv({ ...base, NODE_ENV: "production", AGENT_APPROVAL_SECRET: "s".repeat(32), PRIVY_APP_ID: "app-id" });
  assert.equal(env.NODE_ENV, "production");
});

test("the buy and venue keys are optional, blank is unset, and a one-line PEM keeps its newlines", () => {
  const unset = loadApiEnv({ ...base, UNISWAP_API_KEY: "", SOCKET_API_KEY: "" });
  assert.equal(unset.UNISWAP_API_KEY, undefined);
  assert.equal(unset.SOCKET_API_KEY, undefined);
  assert.equal(unset.ONRAMP_PAGE_URL, undefined);
  const env = loadApiEnv({
    ...base,
    ONRAMP_PAGE_URL: "https://app.getkawase.xyz",
    CDP_API_KEY_ID: "key-id",
    CDP_API_KEY_SECRET: "-----BEGIN EC PRIVATE KEY-----\\nABC\\n-----END EC PRIVATE KEY-----",
    ZEROX_API_KEY: "zx",
  });
  assert.equal(env.ONRAMP_PAGE_URL, "https://app.getkawase.xyz");
  assert.equal(env.CDP_API_KEY_SECRET, "-----BEGIN EC PRIVATE KEY-----\nABC\n-----END EC PRIVATE KEY-----");
  assert.equal(env.ZEROX_API_KEY, "zx");
  assert.throws(() => loadApiEnv({ ...base, ONRAMP_PAGE_URL: "not a url" }), /ONRAMP_PAGE_URL/);
});
