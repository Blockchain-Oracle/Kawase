// Research probe (2026-09-30): can a brand-new, EMPTY wallet get its EIP-7702 setup without holding any USDC?
// A relayer key (ours) pays the gas and carries the user's signed authorization.
import fs from 'node:fs'
import { createPublicClient, createWalletClient, http, erc20Abi } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'

const RPC = 'https://rpc.testnet.arc.io'
const USDC = '0x3600000000000000000000000000000000000000'
const base = JSON.parse(fs.readFileSync(new URL('./.spike-state.testnet.json', import.meta.url)))
const chain = { ...arcTestnet, rpcUrls: { default: { http: [RPC] } } }
const client = createPublicClient({ chain, transport: http(RPC) })
const env = getSmartAccountsEnvironment(chain.id)
const impl = env.implementations.EIP7702StatelessDeleGatorImpl

const user = privateKeyToAccount(generatePrivateKey()) // never funded
const relayer = privateKeyToAccount(base.worker) // funded in spike 4
const userWallet = createWalletClient({ account: user, chain, transport: http(RPC) })
const relayerWallet = createWalletClient({ account: relayer, chain, transport: http(RPC) })
const bal = (a) => client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] })

console.log('user', user.address, 'balance', await bal(user.address), '| relayer', relayer.address, 'balance', await bal(relayer.address))
// The user only signs; no `executor: 'self'` because someone else sends the transaction.
const authorization = await userWallet.signAuthorization({ contractAddress: impl })
const hash = await relayerWallet.sendTransaction({ authorizationList: [authorization], to: user.address, data: '0x' })
const rc = await client.waitForTransactionReceipt({ hash })
const code = await client.getCode({ address: user.address })
const ok = rc.status === 'success' && code?.toLowerCase() === `0xef0100${impl.slice(2).toLowerCase()}`
console.log(ok ? 'PASS' : 'FAIL', 'empty wallet got its 7702 code through a relayer', `https://explorer.testnet.arc.io/tx/${hash}`, 'code', code, 'user balance after', await bal(user.address), 'gas used', rc.gasUsed)
fs.writeFileSync(new URL('./results.7702-relayed.testnet.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), user: user.address, relayer: relayer.address, tx: hash, status: rc.status, code, gasUsed: rc.gasUsed.toString(), ok }, null, 2))
