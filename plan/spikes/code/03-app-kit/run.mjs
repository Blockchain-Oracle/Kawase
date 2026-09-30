// Spike #3: App Kit swap + bridge signed by the user's Circle UCW **EOA** vault (from spike #2).
//
// Finding that shapes this script: `createCircleUserWalletAdapter` rejects EOAs ("supports only 'SCA'
// wallets", adapter-circle-wallets 1.8.0 ucw/server.mjs:13714) because it batches calls through the
// SCA-only `executeBatch`. So we assemble the same adapter Circle builds internally
// (`buildSingleWalletAdapter`): `createViemAdapter` + the public `circleUserWalletSigning` strategy,
// with `atomicBatch: false` so the kit sends each call as its own contractExecution challenge.
// Usage: node run.mjs [--swap] [--bridge] [--earn]   (default: swap + bridge), then answer PINs at
// http://localhost:5199/ (the spike-02 relay page).
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createPublicClient, http, erc20Abi, formatUnits, parseUnits } from 'viem'
import { arcTestnet, baseSepolia } from 'viem/chains'
import { AppKit } from '@circle-fin/app-kit'
import { ArcTestnet } from '@circle-fin/app-kit/chains'
import { createViemAdapter } from '@circle-fin/adapter-viem-v2/next'
import { circleUserWalletSigning } from '@circle-fin/adapter-circle-wallets'
import { ucw, dcw, waitDcwTx } from '../02-ucw-typed-data/circle.mjs'
import { startRelay } from '../02-ucw-typed-data/relay.mjs'

const ARC_RPC = 'https://rpc.testnet.arc.io'
const BASE_SEPOLIA_RPC = 'https://sepolia.base.org'
const USDC = '0x3600000000000000000000000000000000000000'
const EURC = '0x89b50855aa3be2f677cd6303cec089b5f319d72a'
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const SWAP_AMOUNT = '0.5'
const BRIDGE_AMOUNT = '2' // must exceed the CCTPv2 max fee out of Arc (~1.4 USDC on testnet)
const VAULT_FLOAT = '4.5'

const U = JSON.parse(fs.readFileSync(new URL('../02-ucw-typed-data/.spike-state.testnet.json', import.meta.url)))
const OPS = JSON.parse(fs.readFileSync(new URL('../04-delegation/.spike-state.testnet.json', import.meta.url)))
const argv = process.argv.slice(2)
const want = (f) => argv.length === 0 ? f !== '--earn' : argv.includes(f)
const arc = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) })
const base = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) })
const bal = (client, token, who) => client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [who] })
const results = []
const log = (name, expected, ok, detail = {}) => {
  results.push({ name, expected, ok, ...detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (expected ${expected})`, detail.reason ?? '')
}

// ---- 0. Fund the vault EOA from the ops DCW (testnet float) -------------------------------------
if ((await bal(arc, USDC, U.walletAddress)) < parseUnits('3', 6)) {
  const { data } = await dcw.createTransaction({
    walletAddress: OPS.opsAddress, blockchain: 'ARC-TESTNET', tokenAddress: USDC, destinationAddress: U.walletAddress,
    amount: [VAULT_FLOAT], fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: crypto.randomUUID(),
  })
  console.log('funded vault', (await waitDcwTx(data.id)).txHash)
}

// ---- 1. EOA user-wallet adapter ------------------------------------------------------------------
const relay = await startRelay()
const challenges = [] // every challenge the kit opened, in order
const pending = new Map() // challengeId -> relay promise (the device's answer)
const userToken = async () => (await ucw.createUserToken({ userId: U.userId })).data.userToken
const strategy = circleUserWalletSigning({
  apiKey: process.env.CIRCLE_TEST_API_KEY,
  userToken,
  walletId: U.walletId,
  walletAddress: U.walletAddress,
  onChallenge: ({ challengeId, intent }) => {
    challenges.push({ challengeId, intent, at: new Date().toISOString() })
    pending.set(challengeId, relay.run(challengeId, `App Kit: ${JSON.stringify(intent)}`, U.userId))
  },
  onProgress: (p) => console.log(`  · ${p.stage} ${p.status} ${p.txHash ?? ''}`),
  resolveTypedDataSignature: async ({ challengeId }) => {
    const r = await pending.get(challengeId)
    if (r.error) throw new Error(`typed-data challenge failed: ${JSON.stringify(r.error)}`)
    return r.result.data.signature
  },
})
// An EOA cannot executeBatch: turn atomic batching off so each call is its own challenge.
const eoaSigning = { ...strategy, manifest: { ...strategy.manifest, atomicBatch: false } }
const adapter = createViemAdapter({
  capabilities: { addressContext: 'user-controlled', supportedChains: [ArcTestnet] },
  getPublicClient: ({ chain }) => createPublicClient({ chain, transport: http(ARC_RPC) }),
  signing: eoaSigning,
  address: U.walletAddress,
})
const kit = new AppKit()
kit.on('*', (e) => console.log(`  ⇢ kit event ${e?.method ?? e?.type ?? ''} ${e?.values?.txHash ?? e?.txHash ?? ''}`))
const count = () => challenges.length

// ---- 2. Swap USDC -> EURC on Arc Testnet ---------------------------------------------------------
if (want('--swap')) {
  const params = {
    from: { adapter, chain: 'Arc_Testnet' },
    tokenIn: 'USDC', tokenOut: 'EURC', amountIn: SWAP_AMOUNT,
    config: { apiKey: process.env.CIRCLE_TEST_API_KEY, slippageBps: 100 },
  }
  try {
    const est = await kit.estimateSwap(params)
    log('estimateSwap (no challenge)', 'quote', !!est, { reason: JSON.stringify(est, (_, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 400) })
    const before = await bal(arc, EURC, U.walletAddress)
    const c0 = count()
    const out = await kit.swap(params)
    const got = (await bal(arc, EURC, U.walletAddress)) - before
    log('swap 0.5 USDC -> EURC signed by the UCW EOA', 'pass', got > 0n, {
      reason: `+${formatUnits(got, 6)} EURC; ${count() - c0} challenge(s)`,
      challenges: challenges.slice(c0), out: JSON.parse(JSON.stringify(out, (_, v) => (typeof v === 'bigint' ? v.toString() : v))),
    })
  } catch (e) {
    log('swap 0.5 USDC -> EURC signed by the UCW EOA', 'pass', false, { reason: `${e.code ?? ''} ${e.message}`, challenges })
  }
}

// ---- 3. Bridge USDC Arc Testnet -> Base Sepolia (Circle forwarder mints; no destination wallet) ---
if (want('--bridge')) {
  const params = {
    from: { adapter, chain: 'Arc_Testnet' },
    to: { recipientAddress: U.walletAddress, chain: 'Base_Sepolia', useForwarder: true },
    amount: BRIDGE_AMOUNT,
  }
  try {
    const est = await kit.estimateBridge(params)
    log('estimateBridge (no challenge)', 'quote', !!est, { reason: JSON.stringify(est?.fees ?? est, (_, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 400) })
    const before = await bal(base, BASE_SEPOLIA_USDC, U.walletAddress)
    const c0 = count()
    let out = await kit.bridge(params)
    const steps = out.steps?.map((s) => ({ name: s.name, state: s.state, txHash: s.txHash, explorerUrl: s.explorerUrl }))
    const minted = (await bal(base, BASE_SEPOLIA_USDC, U.walletAddress)) - before
    log('bridge 2 USDC Arc Testnet -> Base Sepolia (forwarder)', 'pass', out.state === 'success', {
      reason: `state=${out.state}; minted +${formatUnits(minted, 6)} on Base Sepolia (may lag); ${count() - c0} challenge(s)`,
      challenges: challenges.slice(c0), steps,
    })
  } catch (e) {
    log('bridge 2 USDC Arc Testnet -> Base Sepolia (forwarder)', 'pass', false, { reason: `${e.code ?? ''} ${e.message}`, challenges })
  }
}

// ---- 4. Earn: explore only (deposit is a later stage) --------------------------------------------
if (want('--earn')) {
  try {
    const { vaults } = await kit.earn.exploreVaults({ chain: 'Arc_Testnet', sortBy: 'apy' })
    log('earn.exploreVaults on Arc_Testnet', 'list', Array.isArray(vaults), { reason: `${vaults?.length} vaults` })
  } catch (e) {
    log('earn.exploreVaults on Arc_Testnet', 'list', false, { reason: `${e.code ?? ''} ${e.message}` })
  }
}

const bad = results.filter((x) => !x.ok)
console.log(`\n${results.length - bad.length}/${results.length} as expected; ${challenges.length} challenge(s) total`)
fs.writeFileSync(new URL('./results.testnet.json', import.meta.url), JSON.stringify({ ranAt: new Date().toISOString(), vault: U.walletAddress, results, challenges }, null, 2))
await relay.close()
process.exit(bad.length ? 1 : 0)
