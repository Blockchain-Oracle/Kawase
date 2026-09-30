// Spike #4: ERC-7710 delegation on Arc (MetaMask Delegation Framework v1.3.0).
// HybridDeleGator owned by an ECDSA EOA (stand-in for the UCW EOA), delegation redeemed by
// the Circle DCW "ops" wallet (production path) and by a local "worker" EOA (forced on-chain reverts).
// Usage: node run.mjs            (testnet)
import fs from 'node:fs'
import crypto from 'node:crypto'
import {
  createPublicClient, createWalletClient, http, encodeFunctionData, erc20Abi, parseUnits, formatUnits,
  pad, toHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { entryPoint07Abi, entryPoint07Address, toPackedUserOperation } from 'viem/account-abstraction'
import {
  Implementation, toMetaMaskSmartAccount, createDelegation, createExecution, ExecutionMode,
  getSmartAccountsEnvironment, ScopeType, CaveatType,
} from '@metamask/smart-accounts-kit'
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { hashDelegation } from '@metamask/smart-accounts-kit/utils'
import { DelegationManager as DelegationManagerAbi } from '@metamask/delegation-abis'
import { circle, waitTx } from './circle.mjs'

const RPC = 'https://rpc.testnet.arc.io'
const EXPLORER = 'https://explorer.testnet.arc.io/tx/'
const USDC = '0x3600000000000000000000000000000000000000'
const EURC = '0x89b50855aa3be2f677cd6303cec089b5f319d72a'
const PERIOD_S = 90
const PERIOD_AMOUNT = parseUnits('0.5', 6)

const STATE = new URL('./.spike-state.testnet.json', import.meta.url)
const state = JSON.parse(fs.readFileSync(STATE))
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
const results = []
const log = (name, expected, ok, detail) => {
  results.push({ name, expected, ok, ...detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (expected ${expected})`, detail.tx ? EXPLORER + detail.tx : '', detail.reason ?? '')
}

const chain = { ...arcTestnet, rpcUrls: { default: { http: [RPC] } } }
const client = createPublicClient({ chain, transport: http(RPC) })
const env = getSmartAccountsEnvironment(chain.id)
const acct = (k) => privateKeyToAccount(state[k])
const owner = acct('owner'), worker = acct('worker'), attacker = acct('attacker')
const recipient = acct('recipient').address, stranger = acct('stranger').address
const wallet = (a) => createWalletClient({ account: a, chain, transport: http(RPC) })
const usdcBal = (a) => client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] })

// ---- Circle DCW helpers -------------------------------------------------------------------
async function opsCall(contractAddress, callData, label) {
  try {
    const { data } = await circle.createContractExecutionTransaction({
      walletId: state.opsWalletId, contractAddress, callData,
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: crypto.randomUUID(),
    })
    const t = await waitTx(data.id)
    return { state: t.state, tx: t.txHash, reason: t.errorReason ?? t.errorDetails }
  } catch (e) {
    return { state: 'REJECTED', reason: `${label}: ${e.response?.status} ${JSON.stringify(e.response?.data ?? e.message)}` }
  }
}
async function opsTransfer(token, to, amount) {
  const { data } = await circle.createTransaction({
    walletAddress: state.opsAddress, blockchain: 'ARC-TESTNET', tokenAddress: token, destinationAddress: to,
    amount: [amount], fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: crypto.randomUUID(),
  })
  return waitTx(data.id)
}

// ---- 1. Smart account (HybridDeleGator owned by the EOA) ----------------------------------
const smart = await toMetaMaskSmartAccount({
  client, implementation: Implementation.Hybrid,
  deployParams: [owner.address, [], [], []], deploySalt: '0x', signer: { account: owner },
})
state.deleGator = smart.address
console.log('DeleGator', smart.address, 'owner', owner.address, 'ops', state.opsAddress)

if (!(await smart.isDeployed())) {
  const { factory, factoryData } = await smart.getFactoryArgs()
  const r = await opsCall(factory, factoryData, 'deploy')
  console.log('deploy via SimpleFactory by ops DCW', r.state, r.tx)
  state.deployTx = r.tx
}
// Fund: DeleGator 2 USDC (ERC-20), worker + attacker gas
if ((await usdcBal(smart.address)) < parseUnits('1.5', 6)) console.log('fund DeleGator', (await opsTransfer(USDC, smart.address, '2')).txHash)
if ((await usdcBal(worker.address)) < parseUnits('0.5', 6)) console.log('fund worker', (await opsTransfer(USDC, worker.address, '1')).txHash)
if ((await usdcBal(attacker.address)) < parseUnits('0.1', 6)) console.log('fund attacker', (await opsTransfer(USDC, attacker.address, '0.3')).txHash)
save()

// ---- 2. Delegations (caveats built in code) -----------------------------------------------
const now = Math.floor(Date.now() / 1000)
const baseCaveats = (expiry) => [
  { type: CaveatType.AllowedTargets, targets: [USDC] },
  { type: CaveatType.AllowedMethods, selectors: ['transfer(address,uint256)'] },
  // pin arg 0 of transfer(address,uint256): bytes 4..36
  { type: CaveatType.AllowedCalldata, startIndex: 4, value: pad(recipient, { size: 32 }) },
  { type: CaveatType.Timestamp, afterThreshold: 0, beforeThreshold: expiry },
]
const make = async (to, expiry) => {
  const d = createDelegation({
    environment: env, from: smart.address, to,
    scope: { type: ScopeType.Erc20PeriodTransfer, tokenAddress: USDC, periodAmount: PERIOD_AMOUNT, periodDuration: PERIOD_S, startDate: now - 5 },
    caveats: baseCaveats(expiry), salt: toHex(crypto.randomBytes(32)),
  })
  return { ...d, signature: await smart.signDelegation({ delegation: d }) }
}
const dOps = await make(state.opsAddress, now + 3600)
const dWorker = await make(worker.address, now + 3600)
const dExpired = await make(worker.address, now - 60)
state.delegations = { dOps, dWorker, dExpired }
save()
console.log('caveats on dOps:', dOps.caveats.map((c) => Object.entries(env.caveatEnforcers).find(([, a]) => a.toLowerCase() === c.enforcer.toLowerCase())?.[0]))

const transferData = (to, amt) => encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amt] })
const redeemData = (d, exec) => DelegationManager.encode.redeemDelegations({
  delegations: [[d]], modes: [ExecutionMode.SingleDefault], executions: [[exec]],
})

// Worker path: simulate for the revert reason, then force-send with a fixed gas limit so the
// revert is recorded on-chain with a tx hash.
async function localRedeem(from, d, exec) {
  const data = redeemData(d, exec)
  let reason
  try { await client.call({ account: from.address, to: env.DelegationManager, data }) } catch (e) { reason = e.shortMessage?.split('\n')[0] + ' ' + (e.cause?.data ?? e.data ?? '') }
  const hash = await wallet(from).sendTransaction({ to: env.DelegationManager, data, gas: 500_000n })
  const rc = await client.waitForTransactionReceipt({ hash })
  return { status: rc.status, tx: hash, reason }
}
const opsRedeem = (d, exec) => opsCall(env.DelegationManager, redeemData(d, exec), 'redeem')
const okOps = (r) => r.state === 'COMPLETE'
const t = (amt) => parseUnits(amt, 6)

// ---- 3. Tests: ops DCW (production redeemer) -------------------------------------------------
let r = await opsRedeem(dOps, createExecution({ target: USDC, callData: transferData(recipient, t('0.2')) }))
log('ops: 0.2 USDC to pinned recipient', 'pass', okOps(r), r)
r = await opsRedeem(dOps, createExecution({ target: USDC, callData: transferData(recipient, t('0.3')) }))
log('ops: 0.3 USDC more (period total 0.5 = cap)', 'pass', okOps(r), r)
r = await opsRedeem(dOps, createExecution({ target: USDC, callData: transferData(recipient, t('0.01')) }))
log('ops: 0.01 over the period cap', 'fail', !okOps(r), r)
r = await opsRedeem(dOps, createExecution({ target: USDC, callData: transferData(stranger, t('0.01')) }))
log('ops: wrong recipient', 'fail', !okOps(r), r)

// ---- 4. Tests: worker EOA, forced on-chain reverts ------------------------------------------
const w = async (name, d, exec, expectPass = false) => {
  const r = await localRedeem(worker, d, exec)
  log(`worker: ${name}`, expectPass ? 'pass' : 'fail', expectPass ? r.status === 'success' : r.status === 'reverted', r)
}
await w('0.1 USDC to recipient', dWorker, createExecution({ target: USDC, callData: transferData(recipient, t('0.1')) }), true)
await w('wrong recipient', dWorker, createExecution({ target: USDC, callData: transferData(stranger, t('0.1')) }))
await w('wrong token (EURC)', dWorker, createExecution({ target: EURC, callData: transferData(recipient, t('0.1')) }))
await w('wrong method (approve)', dWorker, createExecution({ target: USDC, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [recipient, t('0.1')] }) }))
await w('native value 0.1 USDC (18dp) to recipient', dWorker, createExecution({ target: recipient, value: parseUnits('0.1', 18), callData: '0x' }))
await w('native value on the USDC transfer call', dWorker, createExecution({ target: USDC, value: 1n, callData: transferData(recipient, t('0.1')) }))
await w('expired delegation', dExpired, createExecution({ target: USDC, callData: transferData(recipient, t('0.1')) }))
await w('leaked key drains full balance to attacker', dWorker, createExecution({ target: USDC, callData: transferData(attacker.address, await usdcBal(smart.address)) }))
await w('leaked key: over period cap to pinned recipient', dWorker, createExecution({ target: USDC, callData: transferData(recipient, t('0.45')) }))
// someone who is not the delegate replays the ops delegation
{
  const r = await localRedeem(attacker, dOps, createExecution({ target: USDC, callData: transferData(recipient, t('0.01')) }))
  log('attacker redeems ops delegation (not the delegate)', 'fail', r.status === 'reverted', r)
}

// ---- 5. Period reset ----------------------------------------------------------------------
console.log(`waiting ${PERIOD_S + 5}s for the period to reset…`)
await new Promise((res) => setTimeout(res, (PERIOD_S + 5) * 1000))
r = await opsRedeem(dOps, createExecution({ target: USDC, callData: transferData(recipient, t('0.5')) }))
log('ops: next period, 0.5 USDC again', 'pass', okOps(r), r)

// ---- 6. Revoke: owner-signed UserOp -> DeleGator.disableDelegation, self-bundled via EntryPoint
// DelegationManager.disableDelegation requires msg.sender == delegator (the DeleGator), so the
// owner EOA cannot call it directly; it goes through the account's execute path.
{
  const dmCall = DelegationManager.encode.disableDelegation({ delegation: dOps })
  const call = await smart.encodeCalls([{ to: env.DelegationManager, data: dmCall }])
  const nonce = await smart.getNonce()
  const fees = await client.estimateFeesPerGas()
  const userOp = {
    sender: smart.address, nonce, callData: call,
    callGasLimit: 200_000n, verificationGasLimit: 300_000n, preVerificationGas: 60_000n,
    maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    signature: '0x',
  }
  userOp.signature = await smart.signUserOperation({ ...userOp, chainId: chain.id })
  const hash = await wallet(worker).writeContract({
    address: entryPoint07Address, abi: entryPoint07Abi, functionName: 'handleOps',
    args: [[toPackedUserOperation(userOp)], worker.address], gas: 800_000n,
  })
  const rc = await client.waitForTransactionReceipt({ hash })
  const disabled = await client.readContract({ address: env.DelegationManager, abi: DelegationManagerAbi, functionName: 'disabledDelegations', args: [hashDelegation(dOps)] })
  log('owner UserOp disableDelegation (self-bundled handleOps)', 'pass', rc.status === 'success' && disabled, { tx: hash, reason: `disabled=${disabled}` })
}
r = await opsRedeem(dOps, createExecution({ target: USDC, callData: transferData(recipient, t('0.01')) }))
log('ops: redeem after disableDelegation', 'fail', !okOps(r), r)

// ---- Summary ------------------------------------------------------------------------------
console.log('\nDeleGator USDC left', formatUnits(await usdcBal(smart.address), 6), '| recipient', formatUnits(await usdcBal(recipient), 6))
const bad = results.filter((x) => !x.ok)
console.log(`${results.length - bad.length}/${results.length} as expected`)
fs.writeFileSync(new URL('./results.testnet.json', import.meta.url), JSON.stringify({ ranAt: new Date().toISOString(), deleGator: smart.address, owner: owner.address, ops: state.opsAddress, deployTx: state.deployTx, results }, null, 2))
