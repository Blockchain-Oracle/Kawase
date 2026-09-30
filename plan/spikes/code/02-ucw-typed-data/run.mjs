// Spike #2: Circle UCW (PIN user keyed by our id, EOA on ARC-TESTNET) signs EIP-712 typed data,
// verified with viem. Then spike #4's production path with the real UCW as the DeleGator owner:
// delegation signed by the UCW, redeemed by the ops DCW, revoked by a UCW-signed UserOp.
// Usage: node run.mjs   (then open the relay page in a browser and enter the PIN per challenge)
import fs from 'node:fs'
import crypto from 'node:crypto'
import {
  createPublicClient, http, encodeFunctionData, erc20Abi, parseUnits, formatUnits, pad, toHex,
  verifyTypedData, recoverTypedDataAddress, hashTypedData, getTypesForEIP712Domain, keccak256, stringToHex,
} from 'viem'
import { toAccount, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { entryPoint07Abi, entryPoint07Address, toPackedUserOperation } from 'viem/account-abstraction'
import {
  Implementation, toMetaMaskSmartAccount, createDelegation, createExecution, ExecutionMode,
  getSmartAccountsEnvironment, ScopeType, CaveatType,
} from '@metamask/smart-accounts-kit'
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { hashDelegation } from '@metamask/smart-accounts-kit/utils'
import { DelegationManager as DelegationManagerAbi } from '@metamask/delegation-abis'
import { ucw, dcw, waitDcwTx, errText } from './circle.mjs'
import { startRelay, inSheetErrors } from './relay.mjs'

const RPC = 'https://rpc.testnet.arc.io'
const EXPLORER = 'https://explorer.testnet.arc.io/tx/'
const BLOCKCHAIN = 'ARC-TESTNET'
const USDC = '0x3600000000000000000000000000000000000000'
const PERIOD_S = 3600
const PERIOD_AMOUNT = parseUnits('0.5', 6)
const ERC1271_MAGIC = '0x1626ba7e'
const DELEGATION_TYPES = {
  Caveat: [{ name: 'enforcer', type: 'address' }, { name: 'terms', type: 'bytes' }],
  Delegation: [{ name: 'delegate', type: 'address' }, { name: 'delegator', type: 'address' }, { name: 'authority', type: 'bytes32' }, { name: 'caveats', type: 'Caveat[]' }, { name: 'salt', type: 'uint256' }],
}

const STATE = new URL('./.spike-state.testnet.json', import.meta.url)
const OPS = JSON.parse(fs.readFileSync(new URL('../04-delegation/.spike-state.testnet.json', import.meta.url)))
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE)) : {}
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
const results = []
const log = (name, expected, ok, detail = {}) => {
  results.push({ name, expected, ok, ...detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (expected ${expected})`, detail.tx ? EXPLORER + detail.tx : '', detail.reason ?? '')
}

const chain = { ...arcTestnet, rpcUrls: { default: { http: [RPC] } } }
const client = createPublicClient({ chain, transport: http(RPC) })
const env = getSmartAccountsEnvironment(chain.id)
const relay = await startRelay()

// ---- 1. UCW user keyed by our own id, PIN + EOA wallet on ARC-TESTNET -----------------------
state.userId ??= crypto.randomUUID() // the app uses our user id (UUIDv7); Circle only needs it unique
save()
try {
  await ucw.createUser({ userId: state.userId })
  console.log('created Circle user', state.userId)
} catch (e) {
  if (e.code !== 155101) throw new Error(`createUser: ${errText(e)}`) // 155101 = user already exists
}
const user = (await ucw.getUser({ userId: state.userId })).data.user
console.log('user', { pinStatus: user.pinStatus, securityQuestionStatus: user.securityQuestionStatus })

if (user.pinStatus !== 'ENABLED') {
  const { data } = await ucw.createUserPinWithWallets({
    userId: state.userId, blockchains: [BLOCKCHAIN], accountType: 'EOA', idempotencyKey: crypto.randomUUID(),
  })
  const r = await relay.run(data.challengeId, 'set PIN + create EOA wallet', state.userId)
  log('PIN set + wallet created (INITIALIZE challenge)', 'pass', !r.error, { reason: JSON.stringify(r.error ?? r.result) })
}
const wallets = (await ucw.listWallets({ userId: state.userId, blockchain: BLOCKCHAIN })).data.wallets
const vault = wallets.find((w) => w.accountType === 'EOA')
if (!vault) throw new Error(`no EOA wallet yet: ${JSON.stringify(wallets)}`)
state.walletId = vault.id
state.walletAddress = vault.address
save()
log('UCW EOA exists on ARC-TESTNET', 'pass', true, { reason: `${vault.address} (${vault.id}, state ${vault.state})` })

// ---- 2. UCW-backed viem account: every signTypedData is a Circle challenge answered on the device --
// Circle validates typed data strictly: a message field that is not in `types` fails with 156026
// ("extra data provided in the message"). viem ignores extra fields, and the MetaMask kit passes the
// whole Delegation (with `signature`, and caveats with `args`), so project the message onto the types.
function projectToTypes(types, type, value) {
  if (type.endsWith(']')) return value.map((v) => projectToTypes(types, type.slice(0, type.lastIndexOf('[')), v))
  const fields = types[type]
  if (!fields) return value
  return Object.fromEntries(fields.map((f) => [f.name, projectToTypes(types, f.type, value[f.name])]))
}
const toCircleData = (td) => JSON.stringify(
  {
    types: { EIP712Domain: getTypesForEIP712Domain({ domain: td.domain }), ...td.types },
    domain: td.domain, primaryType: td.primaryType, message: projectToTypes(td.types, td.primaryType, td.message),
  },
  (_, v) => (typeof v === 'bigint' ? v.toString() : v),
)
async function ucwSignTypedData(td, memo) {
  const { data } = await ucw.signTypedData({ userId: state.userId, walletId: state.walletId, data: toCircleData(td), memo })
  const r = await relay.run(data.challengeId, memo, state.userId)
  if (r.error) return { error: r.error, challengeId: data.challengeId }
  const sig = r.result.data.signature
  return { signature: sig.startsWith('0x') ? sig : `0x${sig}`, challengeId: data.challengeId }
}
const vaultAccount = toAccount({
  address: state.walletAddress,
  async signTypedData(td) {
    const r = await ucwSignTypedData(td, `Kawase: sign ${td.primaryType}`)
    if (r.error) throw new Error(`UCW challenge failed: ${JSON.stringify(r.error)}`)
    return r.signature
  },
  async signMessage() { throw new Error('signMessage is not used by the vault account') },
  async signTransaction() { throw new Error('the vault never signs raw transactions') },
})

// ---- 3. KawaseAuthorization (settings/authority changes, ARCHITECTURE §4) -------------------
const DELEGATION_ONLY = process.argv.includes('--delegation-only') // sections 3-4 passed in run.part1.log
const b32 = (s) => keccak256(stringToHex(s))
const authTd = {
  domain: { name: 'Kawase', version: '1', chainId: chain.id },
  types: {
    KawaseAuthorization: [
      { name: 'intentId', type: 'bytes32' }, { name: 'draftVersion', type: 'uint32' },
      { name: 'draftHash', type: 'bytes32' }, { name: 'action', type: 'string' },
      { name: 'subjectBefore', type: 'bytes32' }, { name: 'subjectAfter', type: 'bytes32' },
      { name: 'expiresAt', type: 'uint64' }, { name: 'nonce', type: 'bytes32' },
    ],
  },
  primaryType: 'KawaseAuthorization',
  message: {
    intentId: b32('intent-0192f3a1'), draftVersion: 2, draftHash: b32('draft-v2'),
    action: 'limits.daily.raise', subjectBefore: b32('daily=20 USDC'), subjectAfter: b32('daily=50 USDC'),
    expiresAt: BigInt(Math.floor(Date.now() / 1000) + 600), nonce: toHex(crypto.randomBytes(32)),
  },
}
if (!DELEGATION_ONLY) {
  const r = await ucwSignTypedData(authTd, 'Kawase: raise your daily limit from 20 to 50 USDC')
  if (r.error) log('UCW signs KawaseAuthorization', 'pass', false, { reason: JSON.stringify(r.error) })
  else {
    const ok = await verifyTypedData({ address: state.walletAddress, ...authTd, signature: r.signature })
    const recovered = await recoverTypedDataAddress({ ...authTd, signature: r.signature })
    log('UCW signs KawaseAuthorization; viem verifyTypedData', 'pass', ok, { reason: `recovered ${recovered}`, signature: r.signature, challengeId: r.challengeId })
    const tampered = await verifyTypedData({ address: state.walletAddress, ...authTd, message: { ...authTd.message, subjectAfter: b32('daily=5000 USDC') }, signature: r.signature })
    log('tampered subjectAfter does not verify', 'fail', !tampered)
    const otherNet = await verifyTypedData({ address: state.walletAddress, ...authTd, domain: { ...authTd.domain, chainId: 5042 }, signature: r.signature })
    log('same signature under the mainnet chainId does not verify', 'fail', !otherNet)
    const ch = (await ucw.getUserChallenge({ challengeId: r.challengeId, userToken: (await ucw.createUserToken({ userId: state.userId })).data.userToken })).data.challenge
    log('server reads challenge status COMPLETE (signature only comes from the device)', 'pass', ch.status === 'COMPLETE', { reason: JSON.stringify(ch) })
  }
}

// ---- 4. User cancels the PIN sheet -----------------------------------------------------------
if (!DELEGATION_ONLY && process.argv.includes('--cancel-test')) {
  const r = await ucwSignTypedData(authTd, 'CANCEL THIS ONE: close the PIN window')
  log('user closes the PIN sheet (155701 via callback, then the sheet closes)', 'error', !!r.error, { reason: JSON.stringify(r.error ?? r) })
}

// ---- 5. Spike #4 production path with the real UCW owner -----------------------------------
async function opsCall(contractAddress, callData, label) {
  try {
    const { data } = await dcw.createContractExecutionTransaction({
      walletId: OPS.opsWalletId, contractAddress, callData,
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: crypto.randomUUID(),
    })
    const t = await waitDcwTx(data.id)
    return { state: t.state, tx: t.txHash, reason: t.errorReason ?? t.errorDetails }
  } catch (e) {
    return { state: 'REJECTED', reason: `${label}: ${errText(e)}` }
  }
}
const usdcBal = (a) => client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] })
const smart = await toMetaMaskSmartAccount({
  client, implementation: Implementation.Hybrid,
  deployParams: [state.walletAddress, [], [], []], deploySalt: '0x', signer: { account: vaultAccount },
})
state.deleGator = smart.address
save()
if (!(await smart.isDeployed())) {
  const { factory, factoryData } = await smart.getFactoryArgs()
  const r = await opsCall(factory, factoryData, 'deploy')
  log('ops DCW deploys the UCW-owned HybridDeleGator', 'pass', r.state === 'COMPLETE', r)
}
if ((await usdcBal(smart.address)) < parseUnits('0.8', 6)) {
  const { data } = await dcw.createTransaction({
    walletAddress: OPS.opsAddress, blockchain: BLOCKCHAIN, tokenAddress: USDC, destinationAddress: smart.address,
    amount: ['1'], fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: crypto.randomUUID(),
  })
  console.log('funded DeleGator', (await waitDcwTx(data.id)).txHash)
}

// Same pinned recipient and stranger as spike #4.
const recipient = privateKeyToAccount(OPS.recipient).address
const stranger = privateKeyToAccount(OPS.stranger).address
const now = Math.floor(Date.now() / 1000)
const delegation = createDelegation({
  environment: env, from: smart.address, to: OPS.opsAddress,
  scope: { type: ScopeType.Erc20PeriodTransfer, tokenAddress: USDC, periodAmount: PERIOD_AMOUNT, periodDuration: PERIOD_S, startDate: now - 5 },
  caveats: [
    { type: CaveatType.AllowedTargets, targets: [USDC] },
    { type: CaveatType.AllowedMethods, selectors: ['transfer(address,uint256)'] },
    { type: CaveatType.AllowedCalldata, startIndex: 4, value: pad(recipient, { size: 32 }) },
    { type: CaveatType.Timestamp, afterThreshold: 0, beforeThreshold: now + 3600 },
  ],
  salt: toHex(crypto.randomBytes(32)),
})
delegation.signature = await smart.signDelegation({ delegation }) // -> UCW signTypedData challenge
state.delegation = delegation
save()
{
  // The DelegationManager checks the full EIP-712 digest (domain separator + struct hash), not
  // hashDelegation() alone (that returns 0xffffffff).
  const digest = hashTypedData({
    domain: { name: 'DelegationManager', version: '1', chainId: chain.id, verifyingContract: env.DelegationManager },
    types: DELEGATION_TYPES, primaryType: 'Delegation', message: delegation,
  })
  const magic = await client.readContract({
    address: smart.address, functionName: 'isValidSignature', args: [digest, delegation.signature],
    abi: [{ type: 'function', name: 'isValidSignature', stateMutability: 'view', inputs: [{ type: 'bytes32' }, { type: 'bytes' }], outputs: [{ type: 'bytes4' }] }],
  })
  log('UCW-signed delegation valid via ERC-1271 on the DeleGator', 'pass', magic === ERC1271_MAGIC, { reason: `isValidSignature -> ${magic}` })
}

const t = (amt) => parseUnits(amt, 6)
const transfer = (to, amt) => createExecution({ target: USDC, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amt] }) })
const redeem = (exec) => opsCall(env.DelegationManager, DelegationManager.encode.redeemDelegations({
  delegations: [[delegation]], modes: [ExecutionMode.SingleDefault], executions: [[exec]],
}), 'redeem')
const done = (r) => r.state === 'COMPLETE'

let r = await redeem(transfer(recipient, t('0.2')))
log('ops redeems 0.2 USDC to the pinned recipient', 'pass', done(r), r)
r = await redeem(transfer(recipient, t('0.4')))
log('ops redeems 0.4 more (0.6 > 0.5 period cap)', 'fail', !done(r), r)
r = await redeem(transfer(stranger, t('0.01')))
log('ops redeems to a different recipient', 'fail', !done(r), r)

// Revoke: the UCW signs an EntryPoint v0.7 UserOp (typed data); the ops DCW submits handleOps.
{
  const callData = await smart.encodeCalls([{ to: env.DelegationManager, data: DelegationManager.encode.disableDelegation({ delegation }) }])
  const fees = await client.estimateFeesPerGas()
  const userOp = {
    sender: smart.address, nonce: await smart.getNonce(), callData,
    callGasLimit: 200_000n, verificationGasLimit: 300_000n, preVerificationGas: 60_000n,
    maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, signature: '0x',
  }
  userOp.signature = await smart.signUserOperation({ ...userOp, chainId: chain.id }) // -> UCW challenge
  const before = await usdcBal(smart.address)
  const r = await opsCall(entryPoint07Address, encodeFunctionData({
    abi: entryPoint07Abi, functionName: 'handleOps', args: [[toPackedUserOperation(userOp)], OPS.opsAddress],
  }), 'handleOps')
  const disabled = await client.readContract({ address: env.DelegationManager, abi: DelegationManagerAbi, functionName: 'disabledDelegations', args: [hashDelegation(delegation)] })
  const gasPaid = formatUnits(before - (await usdcBal(smart.address)), 6)
  log('UCW-signed UserOp disableDelegation, handleOps sent by ops DCW', 'pass', done(r) && disabled, { ...r, reason: `disabled=${disabled}; DeleGator paid ${gasPaid} USDC gas ${r.reason ?? ''}` })
}
r = await redeem(transfer(recipient, t('0.01')))
log('ops redeems after revoke', 'fail', !done(r), r)

// ---- Summary ----------------------------------------------------------------------------------
const bad = results.filter((x) => !x.ok)
console.log(`\n${results.length - bad.length}/${results.length} as expected`)
fs.writeFileSync(new URL('./results.testnet.json', import.meta.url), JSON.stringify({
  ranAt: new Date().toISOString(), circleUserId: state.userId, vault: state.walletAddress, deleGator: smart.address, ops: OPS.opsAddress, results, inSheetErrors,
}, null, 2))
await relay.close()
process.exit(bad.length ? 1 : 0)
