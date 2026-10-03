// Zod env loaders per app; the only process.env reader. Server-only.
// Each app calls its own loader once at startup; a missing or malformed value stops the process with a
// readable message instead of failing later inside a request.
import { z } from "zod";

const hexKey = z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/, "expected a 32-byte hex key");
const compressedPublicKey = z.string().regex(/^0[23][0-9a-fA-F]{64}$/, "expected a compressed P-256 public key");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected an address");
const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
/** `KEY=` in a .env file means "not set", not an empty secret. */
const blankIsUnset = (value: unknown) => (value === "" ? undefined : value);
const MAX_PORT = 65535;
const port = z.coerce.number().int().min(1).max(MAX_PORT);

const DEFAULT_API_PORT = 3000;
/** An HMAC key shorter than this is too weak to sign approvals with. */
const APPROVAL_SECRET_MIN = 32;

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: port.default(DEFAULT_API_PORT),
  DATABASE_URL: z.url(),
  /** The api's own public address, for links in emails and the web app's cookies. */
  KAWASE_PUBLIC_URL: z.url().optional(),
  /** Browser origins allowed to call the api (the web app), comma-separated. Localhost is added in development. */
  KAWASE_WEB_ORIGINS: z.string().default(""),
  /** The web app's own address, for links people share (payment requests: `{web}/r/{token}`). */
  KAWASE_WEB_URL: z.url().default("https://app.getkawase.xyz"),
  /** Turnkey: the parent organization and its server API key (read access to every user's sub-organization). */
  TURNKEY_ORGANIZATION_ID: z.uuid(),
  TURNKEY_API_PUBLIC_KEY: compressedPublicKey,
  TURNKEY_API_PRIVATE_KEY: hexKey,
  TURNKEY_API_BASE_URL: z.url().default("https://api.turnkey.com"),
  /** Circle developer-controlled wallets (the agent's wallets). TEST always; LIVE only where mainnet is enabled. */
  CIRCLE_TEST_API_KEY: z.string().min(1),
  CIRCLE_TEST_ENTITY_SECRET: z.string().min(1),
  CIRCLE_LIVE_API_KEY: z.string().optional(),
  CIRCLE_LIVE_ENTITY_SECRET: z.string().optional(),
  MAINNET_ENABLED: flag,
  /**
   * Spending within the allowance and deleting the account need a proof from the device's Turnkey key (security
   * review M12). Off until the app that sends it is on people's phones; a proof that is sent is checked either way.
   */
  DEVICE_PROOF_REQUIRED: flag,
  /** The relayer key per network: a plain key on our server that pays for 7702 setups (spike 15). */
  RELAYER_PRIVATE_KEY_TESTNET: hexKey,
  RELAYER_PRIVATE_KEY_MAINNET: hexKey.optional(),
  /** The agent's redeeming wallet per network (Circle DCW): the address named in every allowance. */
  OPS_WALLET_ID_TESTNET: z.string().min(1),
  OPS_WALLET_ADDRESS_TESTNET: address,
  OPS_WALLET_ID_MAINNET: z.string().optional(),
  OPS_WALLET_ADDRESS_MAINNET: address.optional(),
  /** Faucet drips for new testnet wallets. */
  FAUCET_WALLET_ID_TESTNET: z.string().optional(),
  /** The agent's model keys (D29: provider-agnostic; OpenAI is the default role model). Chat is off without one. */
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  /** Alchemy's Portfolio and Prices APIs: every token a wallet holds on Arc and the six bridge chains. Without it the
   * portfolio falls back to the Transfer-log watcher + Multicall3 (Arc) and LI.FI (other chains). */
  ALCHEMY_API_KEY: z.string().optional(),
  /** Per-deployment model overrides, "provider:model" (e.g. anthropic:claude-sonnet-5-5). */
  KAWASE_MODEL_AGENT_CHAT: z
    .string()
    .regex(/^(openai|anthropic):.+$/)
    .optional(),
  KAWASE_MODEL_AGENT_VOICE: z
    .string()
    .regex(/^(openai|anthropic):.+$/)
    .optional(),
  KAWASE_MODEL_UTILITY: z
    .string()
    .regex(/^(openai|anthropic):.+$/)
    .optional(),
  /** HMAC key for tool approvals (32+ chars); a random one per process when unset (approvals then die with a restart). */
  AGENT_APPROVAL_SECRET: z.string().min(APPROVAL_SECRET_MIN).optional(),
  /** Voice (Stage 10): LiveKit Cloud. Voice is off without all three. */
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  /** Push (Stage 9): Expo's push service; the token is needed only if "enhanced security" is on for the project. */
  EXPO_ACCESS_TOKEN: z.preprocess(blankIsUnset, z.string().optional()),
  /** Email (Stage 9): Resend, from an address on a domain verified there. Email is off without both. */
  RESEND_API_KEY: z.preprocess(blankIsUnset, z.string().optional()),
  EMAIL_FROM: z.preprocess(blankIsUnset, z.string().optional()),
  /** The oldest app version served ("1.2.0"); older apps show "Update required". Unset = every version. */
  KAWASE_MIN_APP_VERSION: z.preprocess(blankIsUnset, z.string().regex(/^\d+(\.\d+){0,2}$/).optional()),
  /** The testnet x402 demo seller (apps/x402-seller): Circle's catalog has no testnet listings (MASTER-PLAN:233). */
  X402_DEMO_SELLER_URL: z.preprocess(blankIsUnset, z.url().optional()),
  /** Onramp: the hostname of a page that embeds the widget in an iframe. Unset in the app's flow (top level). */
  ONRAMP_REFERRER_DOMAIN: z.preprocess(blankIsUnset, z.string().regex(/^[a-z0-9.-]+$/).optional()),
  /** RPC overrides; viem's built-in Arc endpoints are used when unset. */
  ARC_RPC_URL_TESTNET: z.url().optional(),
  ARC_RPC_URL_MAINNET: z.url().optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

function report(error: z.ZodError, app: string): never {
  const lines = error.issues.map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  throw new Error(`Invalid environment for ${app}:\n${lines.join("\n")}`);
}

/** Reads the api's variables from `process.env` (or the given source, in tests). */
export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const parsed = apiEnvSchema.safeParse(source);
  if (!parsed.success) report(parsed.error, "api");
  if (parsed.data.MAINNET_ENABLED) {
    const missing = (
      [
        "CIRCLE_LIVE_API_KEY",
        "CIRCLE_LIVE_ENTITY_SECRET",
        "RELAYER_PRIVATE_KEY_MAINNET",
        "OPS_WALLET_ID_MAINNET",
        "OPS_WALLET_ADDRESS_MAINNET",
      ] as const
    ).filter((key) => !parsed.data[key]);
    if (missing.length) throw new Error(`MAINNET_ENABLED=true needs: ${missing.join(", ")}`);
  }
  return parsed.data;
}
