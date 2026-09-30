// Move testnet USDC from the archived ATI wallet (same Circle account) to the spike ops wallet.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { circle, waitTx } from './circle.mjs'
const state = JSON.parse(fs.readFileSync(new URL('./.spike-state.testnet.json', import.meta.url)))
const { data } = await circle.createTransaction({
  walletAddress: '0xb6d63e91ad3a01a2abbe472017d1623f9bd7ca10',
  blockchain: 'ARC-TESTNET',
  tokenAddress: '0x3600000000000000000000000000000000000000',
  destinationAddress: state.opsAddress,
  amount: ['12'],
  fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  idempotencyKey: crypto.randomUUID(),
})
const t = await waitTx(data.id)
console.log(t.state, t.txHash, t.errorReason ?? '')
