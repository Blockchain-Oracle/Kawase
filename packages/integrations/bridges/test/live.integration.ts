// Live, no funds move: Across and Relay quotes for 20 USDC Arc → Base to someone else, built and checked; and the
// gasless Base → Arc permit Relay asks for, checked. Run: pnpm test:live
import assert from "node:assert/strict";

import { acrossQuote, checkAcrossCalls, checkRelayCalls, checkRelayPermit, relayContracts, relayQuote } from "../src/index";

const ARC = 5042;
const BASE = 8453;
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WALLET = "0x000000000000000000000000000000000000bEEF";
const FRIEND = "0x000000000000000000000000000000000000dEaD";
const AMOUNT = 20_000_000n;

const across = await acrossQuote({ originChainId: ARC, destinationChainId: BASE, inputToken: ARC_USDC, outputToken: BASE_USDC, amount: AMOUNT, depositor: WALLET, recipient: FRIEND });
const acrossCheck = checkAcrossCalls(across.calls, { spokePool: across.spokePool, depositor: WALLET, recipient: FRIEND, inputToken: ARC_USDC, outputToken: BASE_USDC, amount: AMOUNT, minOutput: across.minOutputAmount, destinationChainId: BASE });
assert.ok(acrossCheck.ok, JSON.stringify(acrossCheck));
console.log(`Across: ${across.outputAmount} out, ${across.fillSeconds}s, spoke ${across.spokePool}`);

const relay = await relayQuote({ originChainId: ARC, destinationChainId: BASE, originCurrency: ARC_USDC, destinationCurrency: BASE_USDC, amount: AMOUNT, user: WALLET, recipient: FRIEND });
const depositories = await relayContracts(ARC);
const relayCheck = checkRelayCalls(relay.calls, { depositories, depositor: WALLET, token: ARC_USDC, amount: AMOUNT });
assert.ok(relayCheck.ok, JSON.stringify(relayCheck));
console.log(`Relay: ${relay.outputAmount} out, request ${relay.requestId.slice(0, 10)}…`);

const bring = await relayQuote({ originChainId: BASE, destinationChainId: ARC, originCurrency: BASE_USDC, destinationCurrency: ARC_USDC, amount: AMOUNT, user: WALLET, recipient: WALLET, usePermit: true });
assert.ok(bring.permit && bring.calls.length === 0);
const baseContracts = await relayContracts(BASE);
const proxy = baseContracts.find((address) => address.toLowerCase() === String(bring.permit!.typedData.message.to).toLowerCase());
assert.ok(proxy, "the permit pays a Relay contract");
assert.ok(checkRelayPermit(bring.permit, { chainId: BASE, token: BASE_USDC, from: WALLET, amount: AMOUNT, approvalProxy: proxy }));
console.log(`Bring to Arc (permit, gasless): ${bring.outputAmount} arrives on Arc`);
