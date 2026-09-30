// Step 1: create (once) the spike actors and fund the redeemer from the Circle faucet.
// owner   = local EOA, stand-in for the UCW EOA (UCW signTypedData is spike #2)
// worker  = local EOA, a second delegate used for the "leaked worker key" test
// attacker= local EOA, never named in the delegation
// ops     = Circle DCW EOA on ARC-TESTNET (the production redeemer)
import fs from 'node:fs'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { circle } from './circle.mjs'

const FILE = new URL('./.spike-state.testnet.json', import.meta.url)
const state = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {}
for (const k of ['owner', 'worker', 'attacker', 'recipient', 'stranger'])
  state[k] ??= generatePrivateKey()

if (!state.opsWalletId) {
  const { data } = await circle.createWallets({
    walletSetId: 'd010cb28-c41a-55a0-a971-ddd90c73a57b',
    blockchains: ['ARC-TESTNET'],
    accountType: 'EOA',
    count: 1,
    metadata: [{ name: 'spike-04-ops-redeemer' }],
  })
  state.opsWalletId = data.wallets[0].id
  state.opsAddress = data.wallets[0].address
}
fs.writeFileSync(FILE, JSON.stringify(state, null, 2))

const addr = (k) => privateKeyToAccount(state[k]).address
console.log({ ops: state.opsAddress, owner: addr('owner'), worker: addr('worker'), attacker: addr('attacker'), recipient: addr('recipient'), stranger: addr('stranger') })

if (process.argv.includes('--faucet')) {
  for (const address of [state.opsAddress, addr('worker')]) {
    try {
      await circle.requestTestnetTokens({ address, blockchain: 'ARC-TESTNET', usdc: true })
      console.log('faucet ok', address)
    } catch (e) { console.log('faucet failed', address, e.response?.status, JSON.stringify(e.response?.data ?? e.message)) }
  }
}
