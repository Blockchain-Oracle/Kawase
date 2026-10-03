// M6: the phone checks what it signs against what is compiled into the app, whatever the server sent. Every grant
// Kawase builds today must pass the device decoder; a grant whose bytes differ from its card, a delegation for another
// wallet, contract or chain, an unknown caveat, a revoke that does more than revoke, and a 7702 authorization for any
// contract but the DeleGator or any chain but Arc are refused before Turnkey is asked for a signature.
import assert from "node:assert/strict";
import { test } from "node:test";
import { getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import { encodeFunctionData, erc20Abi, pad, toFunctionSelector, type Address, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  buildAllowanceGrant,
  buildAutomationGrant,
  buildBridgeGrants,
  buildMarketplaceGrant,
  buildProtectGrants,
  buildRelayedBatch,
  buildSaveGrants,
  describeGrant,
  encodeRevoke,
  encodeSelfBatch,
  grantTypedData,
  withSignature,
  PROTECT_PURPOSES,
  type ProtectPurpose,
} from "../src";
import { DELEGATION_FRAMEWORK, getNetwork } from "@kawase/networks";

import { ARC_CHAIN_IDS, SigningRefused, checkAuthorization, checkGrant, checkRevoke, checkTransferGrant, checkTypedData, decodeDelegation, turnkeySigner, type ShownGrant } from "@kawase/wallet";

const network = getNetwork("testnet");
const wallet = privateKeyToAccount(generatePrivateKey()).address;
const other = privateKeyToAccount(generatePrivateKey()).address;
const ops = privateKeyToAccount(generatePrivateKey()).address;
const relayer = privateKeyToAccount(generatePrivateKey()).address;
const salt = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;
const DAY = 86_400;
const now = 1_790_000_000;
const json = <T>(value: T) => JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))) as T;
const refused = (run: () => unknown, reason: RegExp) =>
  assert.throws(run, (error: unknown) => error instanceof SigningRefused && reason.test(error.reason), `expected a refusal matching ${reason}`);

const allowanceTerms = { network, wallet, redeemer: ops, token: network.addresses.usdc, amountPerPeriod: 5_000_000_000n, periodSeconds: DAY, startsAt: now, expiresAt: now + 90 * DAY, salt: salt(1) };
/** What the api sends the app: the typed data and the receipt the card renders, both as JSON. */
const offer = (grant: Parameters<typeof grantTypedData>[1]) => ({ typedData: json(grantTypedData(network, grant)), receipt: json(describeGrant(network, grant)) as unknown as ShownGrant });

test("the pinned addresses and chain ids are MetaMask's v1.3.0 deployment on both Arc networks", () => {
  assert.deepEqual([...ARC_CHAIN_IDS].sort(), [5042, 5042002]);
  for (const chainId of ARC_CHAIN_IDS) {
    const environment = getSmartAccountsEnvironment(chainId);
    assert.equal(environment.DelegationManager.toLowerCase(), DELEGATION_FRAMEWORK.delegationManager.toLowerCase());
    assert.equal(environment.implementations.EIP7702StatelessDeleGatorImpl?.toLowerCase(), DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.toLowerCase());
    const enforcers = environment.caveatEnforcers as Record<string, string>;
    const names: Record<keyof typeof DELEGATION_FRAMEWORK.enforcers, string> = {
      erc20PeriodTransfer: "ERC20PeriodTransferEnforcer",
      erc20TransferAmount: "ERC20TransferAmountEnforcer",
      allowedTargets: "AllowedTargetsEnforcer",
      allowedMethods: "AllowedMethodsEnforcer",
      allowedCalldata: "AllowedCalldataEnforcer",
      redeemer: "RedeemerEnforcer",
      timestamp: "TimestampEnforcer",
      limitedCalls: "LimitedCallsEnforcer",
      valueLte: "ValueLteEnforcer",
      nativeTokenPeriodTransfer: "NativeTokenPeriodTransferEnforcer",
      exactExecution: "ExactExecutionEnforcer",
      exactExecutionBatch: "ExactExecutionBatchEnforcer",
      exactCalldata: "ExactCalldataEnforcer",
    };
    for (const [key, name] of Object.entries(names)) assert.equal(enforcers[name]?.toLowerCase(), DELEGATION_FRAMEWORK.enforcers[key as keyof typeof names].toLowerCase(), `${name} on ${chainId}`);
  }
});

test("a 7702 authorization: only the DeleGator, only on Arc", () => {
  checkAuthorization({ contractAddress: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator, chainId: 5042002 });
  checkAuthorization({ address: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator, chainId: 5042 });
  refused(() => checkAuthorization({ contractAddress: other, chainId: 5042 }), /contract other than the DeleGator/);
  refused(() => checkAuthorization({ contractAddress: DELEGATION_FRAMEWORK.hybridDeleGatorImpl, chainId: 5042 }), /contract other than the DeleGator/);
  // Chain id 0 would make the wallet's code the attacker's on every chain at once.
  refused(() => checkAuthorization({ contractAddress: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator, chainId: 0 }), /chain other than Arc/);
  refused(() => checkAuthorization({ contractAddress: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator, chainId: 8453 }), /chain other than Arc/);
});

test("the Turnkey signer refuses before Turnkey is asked for anything", async () => {
  let asked = 0;
  const signer = turnkeySigner({
    address: wallet,
    approval: "session",
    signRawPayload: async () => {
      asked += 1;
      return { r: "01".repeat(32), s: "01".repeat(32), v: "00" };
    },
    signTransaction: async () => "0x",
  });
  await assert.rejects(signer.signAuthorization({ contractAddress: other, chainId: 5042002, nonce: 0 }), SigningRefused);
  await assert.rejects(signer.signAuthorization({ contractAddress: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator, chainId: 0, nonce: 0 }), SigningRefused);
  const theirs = grantTypedData(network, buildAllowanceGrant({ ...allowanceTerms, wallet: other }));
  await assert.rejects(signer.signTypedData(theirs as TypedDataDefinition), SigningRefused);
  assert.equal(asked, 0);
  // What Kawase does ask for is signed.
  await signer.signAuthorization({ contractAddress: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator, chainId: 5042002, nonce: 0 });
  await signer.signTypedData(grantTypedData(network, buildAllowanceGrant(allowanceTerms)) as TypedDataDefinition);
  // Typed data that is not a delegation (a step-up message) is not this check's business.
  await signer.signTypedData({ domain: { name: "Kawase", version: "1", chainId: 5042002 }, types: { LimitChange: [{ name: "id", type: "string" }] }, primaryType: "LimitChange", message: { id: "x" } });
  assert.equal(asked, 3);
});

test("every grant Kawase builds decodes on the phone", () => {
  const expiresAt = now + 30 * DAY;
  const grants = [
    buildAllowanceGrant(allowanceTerms),
    buildAutomationGrant({ ...allowanceTerms, recipient: other }),
    buildMarketplaceGrant({ ...allowanceTerms, agentWallet: other }),
    ...Object.values(buildSaveGrants({ network, wallet, redeemer: ops, usdc: network.addresses.usdc, vault: other, expiresAt, salts: { approve: salt(2), deposit: salt(3), withdraw: salt(4) } })),
    ...Object.values(buildBridgeGrants({ network, wallet, redeemer: ops, usdc: network.addresses.usdc, bridge: other, domain: 6, expiresAt, salts: { allowance: salt(5), burn: salt(6) } })),
    ...Object.values(
      buildProtectGrants({
        network,
        wallet,
        redeemer: ops,
        spoke: other,
        router: relayer,
        collateral: { token: network.addresses.eurc, reserveId: 2, cap: 1_000_000n },
        debt: { token: network.addresses.usdc, reserveId: 1, cap: 500_000n },
        fee: 500,
        expiresAt,
        salts: Object.fromEntries(PROTECT_PURPOSES.map((purpose, index) => [purpose, salt(30 + index)])) as Record<ProtectPurpose, Hex>,
      }),
    ),
    buildRelayedBatch({ network, wallet, relayer, calls: [{ to: network.addresses.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [other, 1n] }) }], expiresAt, salt: salt(11) }),
    buildRelayedBatch({ network, wallet, relayer, calls: [{ to: network.addresses.usdc, data: "0x" }, { to: network.addresses.eurc, data: "0x" }], expiresAt, salt: salt(12) }),
  ];
  let checked = 0;
  for (const grant of grants) {
    if (typeof grant !== "object" || !grant || !("caveats" in grant)) continue;
    checkTypedData(json(grantTypedData(network, grant)), wallet);
    // The phone reads every grant exactly as the api's receipt describes it (relayed batches are not grants).
    if (grant.delegate !== relayer) checkGrant(offer(grant).typedData, offer(grant).receipt, wallet);
    checked += 1;
  }
  // allowance, automation, marketplace, save, bridge, margin protection and relayed batches: every one is a delegation.
  assert.equal(checked, grants.length);
  assert.ok(checked >= 12);
});

test("a grant whose bytes match its card is signed; one that differs from it is refused", () => {
  for (const grant of [buildAllowanceGrant(allowanceTerms), buildAutomationGrant({ ...allowanceTerms, recipient: other }), buildMarketplaceGrant({ ...allowanceTerms, agentWallet: other })]) {
    const { typedData, receipt } = offer(grant);
    const decoded = checkTransferGrant(typedData, receipt, wallet);
    assert.equal(decoded.delegate, ops);
  }
  // The card says 50 a day; the bytes say 5,000.
  const { typedData, receipt } = offer(buildAllowanceGrant(allowanceTerms));
  refused(() => checkTransferGrant(typedData, { ...receipt, amountPerPeriod: "50000000" }, wallet), /amount/);
  // A recipient pinned on the card but not in the bytes (or another one).
  const automation = offer(buildAutomationGrant({ ...allowanceTerms, recipient: other }));
  refused(() => checkTransferGrant(automation.typedData, { ...automation.receipt, recipient: relayer }, wallet), /recipient/);
  // A save grant (approve to a vault) is a grant, but not a transfer grant.
  const save = buildSaveGrants({ network, wallet, redeemer: ops, usdc: network.addresses.usdc, vault: other, expiresAt: now + DAY, salts: { approve: salt(40), deposit: salt(41), withdraw: salt(42) } });
  checkGrant(offer(save.approve).typedData, offer(save.approve).receipt, wallet);
  refused(() => checkTransferGrant(offer(save.approve).typedData, offer(save.approve).receipt, wallet), /more than its token|more than transfer/);
  // A deposit whose receiver pin the card shows differently.
  const deposit = offer(save.deposit);
  refused(() => checkGrant(deposit.typedData, { ...deposit.receipt, pins: [{ startIndex: 36, address: other, value: pad(other) }] }, wallet), /pinned arguments/);
  // A margin-protection approval the card says can be used once, signed to be used without limit, is refused.
  const protect = buildProtectGrants({
    network,
    wallet,
    redeemer: ops,
    spoke: other,
    router: relayer,
    collateral: { token: network.addresses.eurc, reserveId: 2, cap: 1_000_000n },
    debt: { token: network.addresses.usdc, reserveId: 1, cap: 500_000n },
    fee: 500,
    expiresAt: now + DAY,
    salts: Object.fromEntries(PROTECT_PURPOSES.map((purpose, index) => [purpose, salt(50 + index)])) as Record<ProtectPurpose, Hex>,
  });
  const approveRouter = offer(protect.approveRouter);
  assert.equal(approveRouter.receipt.maxCalls, 1);
  checkGrant(approveRouter.typedData, approveRouter.receipt, wallet);
  refused(() => checkGrant(approveRouter.typedData, { ...approveRouter.receipt, maxCalls: 2 }, wallet), /uses/);
  // An approval cap on the card that is not the one in the bytes.
  refused(() => checkGrant(offer(protect.approveSpoke).typedData, approveRouter.receipt, wallet), /pinned arguments|targets/);
  // Redeemable by someone else than the card says.
  refused(() => checkGrant(offer(buildAllowanceGrant({ ...allowanceTerms, redeemer: relayer })).typedData, receipt, wallet), /redeemer/);
  // Another token than the card's.
  refused(() => checkGrant(offer(buildAllowanceGrant({ ...allowanceTerms, token: network.addresses.eurc })).typedData, receipt, wallet), /token/);
  // A longer life than the card shows.
  refused(() => checkGrant(offer(buildAllowanceGrant({ ...allowanceTerms, expiresAt: now + 900 * DAY })).typedData, receipt, wallet), /expiry/);
  // Terms the api could not read are never signed.
  refused(() => checkGrant(typedData, { ...receipt, unknownCaveats: [other] }, wallet), /could not read/);
  // A grant that could do anything with the exact calls of a relayed batch is not a spending grant.
  const relayed = json(grantTypedData(network, buildRelayedBatch({ network, wallet, relayer, calls: [{ to: other, data: "0x" }], expiresAt: now + DAY, salt: salt(13) })));
  refused(() => checkGrant(relayed, receipt, wallet), /terms its card does not show/);
});

test("a delegation for another wallet, contract or chain, a re-delegation, or an unknown caveat is refused", () => {
  const typed = json(grantTypedData(network, buildAllowanceGrant(allowanceTerms))) as unknown as { domain: Record<string, unknown>; message: Record<string, unknown>; primaryType: string };
  refused(() => decodeDelegation(typed, other), /another wallet/);
  refused(() => decodeDelegation({ ...typed, domain: { ...typed.domain, verifyingContract: other } }, wallet), /another contract/);
  refused(() => decodeDelegation({ ...typed, domain: { ...typed.domain, chainId: 1 } }, wallet), /chain other than Arc/);
  refused(() => decodeDelegation({ ...typed, message: { ...typed.message, authority: salt(99) } }, wallet), /re-delegation/);
  const caveats = typed.message.caveats as { enforcer: string; terms: Hex; args: Hex }[];
  refused(() => decodeDelegation({ ...typed, message: { ...typed.message, caveats: [...caveats, { enforcer: other, terms: "0x01", args: "0x" }] } }, wallet), /does not know/);
  refused(() => decodeDelegation({ ...typed, message: { ...typed.message, caveats: [] } }, wallet), /without limits/);
  // A Delegation-shaped message under another type name, aimed at the DelegationManager, is refused too.
  refused(() => checkTypedData({ ...typed, primaryType: "Permission" }, wallet), /another type name/);
});

test("a revoke does only that: disableDelegation of this wallet's grants, relayed once or sent by the wallet", () => {
  const mine = withSignature(buildAllowanceGrant(allowanceTerms), "0x1234");
  const second = withSignature(buildAutomationGrant({ ...allowanceTerms, recipient: other, salt: salt(20) }), "0x5678");
  const theirs = withSignature(buildAllowanceGrant({ ...allowanceTerms, wallet: other }), "0x9abc");
  const disable = (grant: typeof mine) => encodeRevoke(network, grant);
  const relayedOf = (calls: { to: Address; data: Hex }[]) => ({ typedData: json(grantTypedData(network, buildRelayedBatch({ network, wallet, relayer, calls, expiresAt: now + 600, salt: salt(21) }))) });
  checkRevoke(relayedOf([disable(mine)]), wallet);
  checkRevoke(relayedOf([disable(mine), disable(second)]), wallet);
  const transfer = { to: network.addresses.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [other, 1_000_000n] }) };
  refused(() => checkRevoke(relayedOf([disable(mine), transfer]), wallet), /calls something else/);
  refused(() => checkRevoke(relayedOf([transfer]), wallet), /calls something else/);
  refused(() => checkRevoke(relayedOf([disable(theirs)]), wallet), /another wallet's grant/);
  // The same request as a transaction the wallet sends itself: one call to the DelegationManager, or its own batch.
  const tx = (to: Address, data: Hex) => ({ transaction: { to, data, value: "0", chainId: network.chainId } });
  checkRevoke(tx(DELEGATION_FRAMEWORK.delegationManager as Address, disable(mine).data), wallet);
  checkRevoke(tx(wallet, encodeSelfBatch([{ ...disable(mine) }, { ...disable(second) }])), wallet);
  checkRevoke(tx(wallet, encodeSelfBatch([{ ...disable(mine) }])), wallet);
  refused(() => checkRevoke(tx(wallet, encodeSelfBatch([{ ...disable(mine) }, transfer])), wallet), /calls something else/);
  refused(() => checkRevoke(tx(network.addresses.usdc, transfer.data), wallet), /sent somewhere else/);
  refused(() => checkRevoke({ transaction: { ...tx(DELEGATION_FRAMEWORK.delegationManager as Address, disable(mine).data).transaction, chainId: 1 } }, wallet), /chain other than Arc/);
  assert.equal(toFunctionSelector("transfer(address,uint256)"), "0xa9059cbb");
});
