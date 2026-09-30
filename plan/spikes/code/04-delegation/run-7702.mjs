// Research probe (2026-09-30): can an ordinary EOA on Arc testnet get on-chain spending limits WITHOUT a
// separate smart account, via EIP-7702 + the MetaMask Delegation Framework?
// The EOA stands in for any embedded-wallet key (Privy, Turnkey, a passkey-derived key, ...).
// Usage: node run-7702.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createPublicClient, createWalletClient, http, encodeFunctionData, erc20Abi, parseUnits, toHex, zeroAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { Implementation, toMetaMaskSmartAccount, createDelegation, createExecution, ExecutionMode, getSmartAccountsEnvironment, ScopeType, CaveatType } from '@metamask/smart-accounts-kit'
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { circle, waitTx } from './circle.mjs'

const RPC = 'https://rpc.testnet.arc.io'
const EXPLORER = 'https://explorer.testnet.arc.io/tx/'
const USDC = '0x3600000000000000000000000000000000000000'
const MEMO = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505'
const memoAbi = [{ type: 'function', name: 'memo', stateMutability: 'nonpayable', inputs: [{ name: 'target', type: 'address' }, { name: 'data', type: 'bytes' }, { name: 'memoId', type: 'bytes32' }, { name: 'memoData', type: 'bytes' }], outputs: [] }]
const PERIOD_S = 120
const CAP = parseUnits('0.5', 6)

const base = JSON.parse(fs.readFileSync(new URL('./.spike-state.testnet.json', import.meta.url)))
const STATE = new URL('./.spike-state.7702.testnet.json', import.meta.url)
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE)) : { user: generatePrivateKey(), a: privateKeyToAccount(generatePrivateKey()).address, b: privateKeyToAccount(generatePrivateKey()).address }
fs.writeFileSync(STATE, JSON.stringify(state, null, 2))
const results = []
const log = (name, expected, ok, detail = {}) => {
  results.push({ name, expected, ok, ...detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (expected ${expected})`, detail.tx ? EXPLORER + detail.tx : '', detail.reason ?? '')
}

const chain = { ...arcTestnet, rpcUrls: { default: { http: [RPC] } } }
const client = createPublicClient({ chain, transport: http(RPC) })
const env = getSmartAccountsEnvironment(chain.id)
const user = privateKeyToAccount(state.user)
const wallet = createWalletClient({ account: user, chain, transport: http(RPC) })
const usdcBal = (a) => client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] })
const transferData = (to, amt) => encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amt] })
const t = (amt) => parseUnits(amt, 6)
const send = async (tx) => {
  const hash = await wallet.sendTransaction(tx)
  const rc = await client.waitForTransactionReceipt({ hash })
  return { status: rc.status, tx: hash }
}
async function opsCall(contractAddress, callData) {
  try {
    const { data } = await circle.createContractExecutionTransaction({ walletId: base.opsWalletId, contractAddress, callData, fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: crypto.randomUUID() })
    const tx = await waitTx(data.id)
    return { state: tx.state, tx: tx.txHash, reason: tx.errorReason ?? tx.errorDetails }
  } catch (e) {
    return { state: 'REJECTED', reason: `${e.status ?? e.response?.status ?? ''} ${e.code ?? ''} ${e.message}` }
  }
}
const memoCall = (label) => send({ to: MEMO, data: encodeFunctionData({ abi: memoAbi, functionName: 'memo', args: [USDC, transferData(state.a, t('0.01')), toHex(crypto.randomBytes(32)), toHex(label)] }), gas: 300_000n }).catch((e) => ({ status: 'rejected', reason: e.shortMessage ?? e.message }))

console.log('user EOA', user.address, 'ops', base.opsAddress, 'impl', env.implementations.EIP7702StatelessDeleGatorImpl)

// 0. Fund the EOA from the ops wallet
if ((await usdcBal(user.address)) < t('1.2')) {
  const { data } = await circle.createTransaction({ walletAddress: base.opsAddress, blockchain: 'ARC-TESTNET', tokenAddress: USDC, destinationAddress: user.address, amount: ['1.5'], fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: crypto.randomUUID() })
  console.log('funded user', (await waitTx(data.id)).txHash)
}

// 1. Baseline: a plain EOA can use Arc's Memo contract
let r = await memoCall('before-7702')
log('plain EOA calls Memo (transfer with a memo)', 'pass', r.status === 'success', r)

// 2. EIP-7702: the EOA delegates its code to the MetaMask stateless DeleGator
const codeBefore = await client.getCode({ address: user.address })
const authorization = await wallet.signAuthorization({ contractAddress: env.implementations.EIP7702StatelessDeleGatorImpl, executor: 'self' })
r = await send({ authorizationList: [authorization], to: user.address, data: '0x' })
const code = await client.getCode({ address: user.address })
log('type-4 (set-code) transaction accepted on Arc testnet', 'pass', r.status === 'success' && code?.toLowerCase() === `0xef0100${env.implementations.EIP7702StatelessDeleGatorImpl.slice(2).toLowerCase()}`, { ...r, reason: `code before=${codeBefore ?? '0x'} after=${code}` })

// 3. Still an ordinary wallet: plain transfer, and Memo again now that the account has code
r = await send({ to: USDC, data: transferData(state.a, t('0.01')) })
log('delegated EOA still sends a normal transfer', 'pass', r.status === 'success', r)
r = await memoCall('after-7702')
log('delegated EOA calls Memo (does Arc still treat it as an EOA?)', 'observe', r.status === 'success', r)

// 4. A spending allowance for the agent, enforced on-chain, on the user's OWN account (no separate pocket)
const smart = await toMetaMaskSmartAccount({ client, implementation: Implementation.Stateless7702, address: user.address, signer: { account: user } })
const now = Math.floor(Date.now() / 1000)
const delegation = createDelegation({
  environment: env, from: smart.address, to: base.opsAddress,
  scope: { type: ScopeType.Erc20PeriodTransfer, tokenAddress: USDC, periodAmount: CAP, periodDuration: PERIOD_S, startDate: now - 5 },
  caveats: [
    { type: CaveatType.AllowedTargets, targets: [USDC] },
    { type: CaveatType.AllowedMethods, selectors: ['transfer(address,uint256)'] },
    { type: CaveatType.Timestamp, afterThreshold: 0, beforeThreshold: now + 3600 },
  ],
  salt: toHex(crypto.randomBytes(32)),
})
delegation.signature = await smart.signDelegation({ delegation })
const redeem = (exec) => opsCall(env.DelegationManager, DelegationManager.encode.redeemDelegations({ delegations: [[delegation]], modes: [ExecutionMode.SingleDefault], executions: [[exec]] }))
const ok = (x) => x.state === 'COMPLETE'
const balBefore = await usdcBal(user.address)

r = await redeem(createExecution({ target: USDC, callData: transferData(state.a, t('0.2')) }))
log('agent sends 0.2 USDC to A from the user\'s own account, no user prompt', 'pass', ok(r), r)
r = await redeem(createExecution({ target: USDC, callData: transferData(state.b, t('0.3')) }))
log('agent sends 0.3 USDC to B (any recipient; total = cap 0.5)', 'pass', ok(r), r)
r = await redeem(createExecution({ target: USDC, callData: transferData(state.a, t('0.01')) }))
log('agent sends 0.01 more (over the period cap)', 'fail', !ok(r), r)
r = await redeem(createExecution({ target: USDC, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [base.opsAddress, t('100')] }) }))
log('agent tries approve() instead of transfer()', 'fail', !ok(r), r)
r = await redeem(createExecution({ target: state.a, value: parseUnits('0.1', 18), callData: '0x' }))
log('agent tries a native-value send', 'fail', !ok(r), r)
log('user balance dropped by exactly 0.5 USDC', 'pass', balBefore - (await usdcBal(user.address)) === t('0.5'), { reason: `delta ${balBefore - (await usdcBal(user.address))}` })

// 5. Revoke: with 7702 the EOA itself is the delegator, so revoking is one ordinary transaction
r = await send({ to: env.DelegationManager, data: DelegationManager.encode.disableDelegation({ delegation }) })
log('user revokes with one direct transaction', 'pass', r.status === 'success', r)
await new Promise((res) => setTimeout(res, (PERIOD_S + 5) * 1000)) // new period, so only the revoke can stop it
r = await redeem(createExecution({ target: USDC, callData: transferData(state.a, t('0.1')) }))
log('agent redeems after the revoke (new period)', 'fail', !ok(r), r)

// 6. Undo the 7702 delegation: back to a codeless EOA
const undo = await wallet.signAuthorization({ contractAddress: zeroAddress, executor: 'self' })
r = await send({ authorizationList: [undo], to: user.address, data: '0x' })
const codeAfter = await client.getCode({ address: user.address })
log('user removes the 7702 code again', 'pass', r.status === 'success' && (!codeAfter || codeAfter === '0x'), { ...r, reason: `code=${codeAfter ?? '0x'}` })

const passed = results.filter((x) => x.expected === 'observe' || x.ok).length
console.log(`\n${passed}/${results.length} as expected`)
fs.writeFileSync(new URL('./results.7702.testnet.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), user: user.address, implementation: env.implementations.EIP7702StatelessDeleGatorImpl, results }, null, 2))
