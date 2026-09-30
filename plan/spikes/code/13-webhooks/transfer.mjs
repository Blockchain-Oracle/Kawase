// Spike 13: move 0.01 testnet USDC from the DCW ops wallet to the UCW vault, to produce real
// transactions.outbound (DCW) and transactions.inbound (UCW) notifications on ARC-TESTNET.
import { readFileSync } from 'node:fs'
import { circle, waitTx } from '../04-delegation/circle.mjs'
const ops = JSON.parse(readFileSync(new URL('../04-delegation/.spike-state.testnet.json', import.meta.url)))
const ucw = JSON.parse(readFileSync(new URL('../02-ucw-typed-data/.spike-state.testnet.json', import.meta.url)))
const USDC = '0x3600000000000000000000000000000000000000'
const { data: bal } = await circle.getWalletTokenBalance({ id: ops.opsWalletId })
console.log('ops balances:', bal.tokenBalances.map((b) => `${b.amount} ${b.token.symbol}`).join(', '))
const { data } = await circle.createTransaction({
  walletId: ops.opsWalletId, blockchain: 'ARC-TESTNET', tokenAddress: USDC,
  destinationAddress: ucw.walletAddress, amount: ['0.01'],
  fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
})
console.log('created', data.id, data.state, new Date().toISOString())
const t = await waitTx(data.id)
console.log('final', t.state, t.txHash, new Date().toISOString())
