// Spike 16 device screen (temporary): the Turnkey wallet in the app, on Arc testnet.
// It mirrors packages/integrations/delegation/test/spike16-local-client.ts, with Turnkey as the signer:
// email code → wallet → relayed 7702 setup → signed allowance → the agent spends with no prompt →
// the wallet signs a larger send → revoke. Every result is posted to the spike server.
import { OtpType, useTurnkey } from "@turnkey/react-native-wallet-kit";
import { useLocalSearchParams } from "expo-router";
import { fetch as expoFetch } from "expo/fetch";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { TransactionSerializable, TypedDataDefinition } from "viem";

import { isWalletConfigured } from "@/wallet/config";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const API = "http://localhost:3022";
const ETHEREUM_FORMAT = "ADDRESS_FORMAT_ETHEREUM";

// The spike server's replies are loosely shaped; each step reads only the fields it needs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- spike code, removed with the spike
type ServerReply = Record<string, any>;
const LOG_PREVIEW_LENGTH = 160;

async function post(path: string, body: Record<string, string>) {
  const response = await expoFetch(API + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as ServerReply;
}

// Test sends go back to the server's operations wallet, so the testnet USDC is reused.
async function recipient() {
  const status = (await (await expoFetch(API + "/status")).json()) as { ops: string };
  return status.ops;
}

function Step({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: disabled ? "#999" : pressed ? "#333" : "#111",
        borderRadius: 12,
        padding: 14,
      })}
    >
      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>{title}</Text>
    </Pressable>
  );
}

function ConfiguredWalletScreen() {
  const { initOtp, completeOtp, createWallet, refreshWallets, wallets, session, logout } = useTurnkey();
  const signer = useWalletSigner("session");
  // The address can be passed by link (kawase://spike-wallet?email=…) for scripted runs.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState<{ otpId: string; otpEncryptionTargetBundle: string } | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const log = (line: string) => setLines((previous) => [...previous, `${new Date().toLocaleTimeString()}  ${line}`]);
  const wallet = signer?.address;

  const run = (name: string, action: () => Promise<unknown>) => async () => {
    const startedAt = Date.now();
    try {
      const result = await action();
      const summary = JSON.stringify(result ?? "ok");
      log(`${name}: ${summary.slice(0, LOG_PREVIEW_LENGTH)} (${Date.now() - startedAt} ms)`);
      await post("/report", { name, ok: "true", ms: String(Date.now() - startedAt), result: summary }).catch(
        () => undefined,
      );
    } catch (error) {
      log(`${name}: ERROR ${String(error)}`);
      await post("/report", { name, ok: "false", error: String(error) }).catch(() => undefined);
    }
  };

  const signAndSubmit = async (request: ServerReply) => {
    if (!signer) throw new Error("no wallet yet");
    const t = request.transaction;
    const transaction: TransactionSerializable = {
      type: "eip1559",
      chainId: t.chainId,
      nonce: t.nonce,
      to: t.to,
      data: t.data,
      value: BigInt(t.value),
      gas: BigInt(t.gas),
      maxFeePerGas: BigInt(t.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas),
    };
    return post("/wallet/submit", { id: request.id, signedTransaction: await signer.signTransaction(transaction) });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Spike 16 · wallet</Text>
        <Text style={{ color: "#555" }}>
          {session ? `Signed in. Wallet: ${wallet ?? "none yet"}` : "Not signed in."}
        </Text>

        {!session ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Your email"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12 }}
            />
            <Step
              title="1 · Email me a code"
              onPress={run("send-code", async () => {
                const result = await initOtp({ otpType: OtpType.Email, contact: email.trim() });
                setOtp({ otpId: result.otpId, otpEncryptionTargetBundle: result.otpEncryptionTargetBundle });
                return "sent";
              })}
            />
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              keyboardType="number-pad"
              style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12 }}
            />
            <Step
              title="2 · Sign in"
              disabled={!otp}
              onPress={run("sign-in", async () => {
                if (!otp) throw new Error("ask for a code first");
                await completeOtp({ ...otp, otpCode: code.trim(), contact: email.trim(), otpType: OtpType.Email });
                return "signed in";
              })}
            />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {!wallet ? (
              <Step
                title="3 · Create my wallet"
                onPress={run("create-wallet", async () => {
                  await createWallet({ walletName: "Kawase", accounts: [ETHEREUM_FORMAT] });
                  await refreshWallets();
                  return "created";
                })}
              />
            ) : (
              <>
                <Step title="4 · Get 1 test USDC" onPress={run("fund", () => post("/fund", { wallet }))} />
                <Step
                  title="5 · Set up (no prompt expected)"
                  onPress={run("setup", async () => {
                    if (!signer) throw new Error("no signer");
                    const request = await post("/setup/request", { wallet });
                    if (request.alreadySetUp) return "already set up";
                    const signed = await signer.signAuthorization(request.authorization);
                    const { address, chainId, nonce, r, s, yParity } = signed;
                    return post("/setup/submit", {
                      wallet,
                      authorization: JSON.stringify({ address, chainId, nonce, r, s, yParity }),
                    });
                  })}
                />
                <Step
                  title="6 · Accept an allowance of 0.3 USDC"
                  onPress={run("allowance", async () => {
                    if (!signer) throw new Error("no signer");
                    const request = await post("/allowance/request", { wallet, amount: "0.3" });
                    const signature = await signer.signTypedData(request.typedData as TypedDataDefinition);
                    return post("/allowance/submit", { id: request.id, signature });
                  })}
                />
                <Step
                  title="7 · Agent sends 0.1 (no prompt)"
                  onPress={run("agent-send", async () =>
                    post("/agent/send", { wallet, to: await recipient(), amount: "0.1" }),
                  )}
                />
                <Step
                  title="8 · Agent tries 0.5 (must fail)"
                  onPress={run("agent-over", async () =>
                    post("/agent/send", { wallet, to: await recipient(), amount: "0.5" }),
                  )}
                />
                <Step
                  title="9 · I send 0.4 myself"
                  onPress={run("wallet-send", async () =>
                    signAndSubmit(await post("/wallet/send/request", { wallet, to: await recipient(), amount: "0.4" })),
                  )}
                />
                <Step
                  title="10 · Revoke the allowance"
                  onPress={run("revoke", async () => signAndSubmit(await post("/revoke/request", { wallet })))}
                />
                <Step
                  title="11 · Agent tries again (must fail)"
                  onPress={run("agent-after-revoke", async () =>
                    post("/agent/send", { wallet, to: await recipient(), amount: "0.05" }),
                  )}
                />
              </>
            )}
            <Step title="Sign out" onPress={run("sign-out", async () => logout())} />
          </View>
        )}
        <Text style={{ fontFamily: "Menlo", fontSize: 11 }}>{lines.join("\n")}</Text>
        <Text style={{ color: "#777", fontSize: 12 }}>Wallets loaded: {wallets.length}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export function WalletScreen() {
  if (!isWalletConfigured) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center" }}>
          The wallet is not configured yet. Add EXPO_PUBLIC_TURNKEY_ORGANIZATION_ID and
          EXPO_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID to apps/mobile/.env and restart the dev server.
        </Text>
      </SafeAreaView>
    );
  }
  return <ConfiguredWalletScreen />;
}
