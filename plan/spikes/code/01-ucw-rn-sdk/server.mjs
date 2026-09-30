// Spike 1 server: creates Circle UCW challenges for the device and verifies what comes back.
// The device never sees an API key; it gets {appId, userToken, encryptionKey, challengeId} per challenge.
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'
import { verifyTypedData, getTypesForEIP712Domain, keccak256, stringToHex, toHex } from 'viem'

config({ path: new URL('../../../../.env', import.meta.url).pathname, quiet: true })
const PORT = 3021
const BLOCKCHAIN = 'ARC-TESTNET'
const CHAIN_ID = 5042002
const USDC = '0x3600000000000000000000000000000000000000'
const ucw = initiateUserControlledWalletsClient({ apiKey: process.env.CIRCLE_TEST_API_KEY })
const STATE_FILE = new URL('.spike-state.testnet.json', import.meta.url)
const RESULTS_FILE = new URL('results.testnet.json', import.meta.url)
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE)) : {}
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
const results = existsSync(RESULTS_FILE) ? JSON.parse(readFileSync(RESULTS_FILE)) : []
const record = (entry) => {
  results.push({ at: new Date().toISOString(), ...entry })
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2))
  console.log('RESULT', JSON.stringify(entry))
}
// The funded vault from spike 2 (its PIN was set by Abu through the web SDK).
const vault = JSON.parse(readFileSync(new URL('../02-ucw-typed-data/.spike-state.testnet.json', import.meta.url)))
const ops = JSON.parse(readFileSync(new URL('../04-delegation/.spike-state.testnet.json', import.meta.url)))
const pendingTypedData = new Map() // challengeId -> { td, address }

const session = async (userId) => (await ucw.createUserToken({ userId })).data
const b32 = (s) => keccak256(stringToHex(s))

const routes = {
  'GET /config': async () => ({ appId: process.env.CIRCLE_TEST_APP_ID, endpoint: 'https://api.circle.com/v1/w3s' }),

  // 1. A brand-new Circle user keyed by our id; the INITIALIZE challenge sets the PIN and creates the EOA wallet.
  'POST /new-user': async () => {
    state.userId = randomUUID()
    await ucw.createUser({ userId: state.userId })
    const { userToken, encryptionKey } = await session(state.userId)
    const { data } = await ucw.createUserPinWithWallets({ userToken, blockchains: [BLOCKCHAIN], accountType: 'EOA', idempotencyKey: randomUUID() })
    save()
    return { label: 'Set a PIN and create the wallet', userToken, encryptionKey, challengeId: data.challengeId }
  },

  // 2. Typed-data signature with the new wallet (the approval binding from ARCHITECTURE §4).
  'POST /sign': async () => {
    const wallet = (await ucw.listWallets({ userId: state.userId, blockchain: BLOCKCHAIN })).data.wallets[0]
    if (!wallet) throw new Error('no wallet yet: run step 1 first')
    state.walletId = wallet.id
    state.walletAddress = wallet.address
    save()
    const td = {
      domain: { name: 'Kawase', version: '1', chainId: CHAIN_ID },
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
        intentId: b32('intent-spike-01'), draftVersion: 1, draftHash: b32('draft-v1'),
        action: 'limits.daily.raise', subjectBefore: b32('daily=20 USDC'), subjectAfter: b32('daily=50 USDC'),
        expiresAt: BigInt(Math.floor(Date.now() / 1000) + 900), nonce: toHex(randomBytes(32)),
      },
    }
    const data = JSON.stringify(
      { types: { EIP712Domain: getTypesForEIP712Domain({ domain: td.domain }), ...td.types }, domain: td.domain, primaryType: td.primaryType, message: td.message },
      (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    )
    const { userToken, encryptionKey } = await session(state.userId)
    const res = await ucw.signTypedData({ userToken, walletId: wallet.id, data, memo: 'Kawase: raise daily limit from 20 to 50 USDC' })
    pendingTypedData.set(res.data.challengeId, { td, address: wallet.address })
    return { label: 'Sign a settings change', userToken, encryptionKey, challengeId: res.data.challengeId }
  },

  // 3. A real transfer from the funded spike-2 vault (its existing PIN) to the ops wallet.
  'POST /transfer': async () => {
    const { userToken, encryptionKey } = await session(vault.userId)
    const res = await ucw.createTransaction({
      userToken, walletId: vault.walletId, blockchain: BLOCKCHAIN, tokenAddress: USDC,
      destinationAddress: ops.opsAddress, amounts: ['0.005'],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: randomUUID(),
    })
    return { label: 'Send 0.005 USDC from the spike-2 vault', userToken, encryptionKey, challengeId: res.data.challengeId }
  },

  // Every SDK callback is posted here, so the write-up has the exact shapes the native SDK returns.
  'POST /callback': async (body) => {
    const entry = { kind: 'callback', ...body }
    const pending = body.challengeId && pendingTypedData.get(body.challengeId)
    const signature = body.success?.result?.data?.signature
    if (pending && signature) {
      entry.verified = await verifyTypedData({ address: pending.address, ...pending.td, signature })
      entry.signer = pending.address
    }
    const txHash = body.success?.result?.data?.txHash
    if (txHash) entry.explorer = `https://testnet.arcscan.app/tx/${txHash}`
    record(entry)
    return { ok: true, verified: entry.verified ?? null }
  },

  'GET /status': async () => {
    const out = { state }
    if (state.userId) {
      const user = (await ucw.getUser({ userId: state.userId })).data.user
      out.user = { pinStatus: user.pinStatus, securityQuestionStatus: user.securityQuestionStatus }
      out.wallets = (await ucw.listWallets({ userId: state.userId })).data.wallets.map((w) => ({ address: w.address, state: w.state, accountType: w.accountType, blockchain: w.blockchain }))
    }
    return out
  },
}

createServer(async (req, res) => {
  const key = `${req.method} ${req.url.split('?')[0]}`
  let raw = ''
  for await (const chunk of req) raw += chunk
  try {
    if (!routes[key]) throw Object.assign(new Error('not found'), { status: 404 })
    const out = await routes[key](raw ? JSON.parse(raw) : {})
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out))
  } catch (e) {
    console.log('ERROR', key, e.status ?? '', e.code ?? '', e.message)
    res.writeHead(e.status ?? 500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message, code: e.code }))
  }
}).listen(PORT, '::', () => console.log(`spike-01 server on :${PORT}`))
