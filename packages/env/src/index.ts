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
  KAWASE_WEB_URL: z.url().default("https://kawase.84.46.247.92.sslip.io"),
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
