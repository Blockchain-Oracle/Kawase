// Re-check the UCW-signed delegation via ERC-1271 with the digest the DelegationManager actually
// verifies: the full EIP-712 hash (domain separator + struct hash), not hashDelegation() alone.
import fs from 'node:fs'
import { createPublicClient, http, hashTypedData } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { hashDelegation } from '@metamask/smart-accounts-kit/utils'
const RPC = 'https://rpc.testnet.arc.io'
const client = createPublicClient({ chain: arcTestnet, transport: http(RPC) })
const env = getSmartAccountsEnvironment(arcTestnet.id)
const s = JSON.parse(fs.readFileSync(new URL('./.spike-state.testnet.json', import.meta.url)))
const d = { ...s.delegation, salt: BigInt(s.delegation.salt) }
const digest = hashTypedData({
  domain: { name: 'DelegationManager', version: '1', chainId: arcTestnet.id, verifyingContract: env.DelegationManager },
  types: { Caveat: [{ name: 'enforcer', type: 'address' }, { name: 'terms', type: 'bytes' }], Delegation: [{ name: 'delegate', type: 'address' }, { name: 'delegator', type: 'address' }, { name: 'authority', type: 'bytes32' }, { name: 'caveats', type: 'Caveat[]' }, { name: 'salt', type: 'uint256' }] },
  primaryType: 'Delegation', message: d,
})
const abi = [{ type: 'function', name: 'isValidSignature', stateMutability: 'view', inputs: [{ type: 'bytes32' }, { type: 'bytes' }], outputs: [{ type: 'bytes4' }] }]
const call = (h) => client.readContract({ address: s.deleGator, abi, functionName: 'isValidSignature', args: [h, d.signature] })
console.log('isValidSignature(EIP-712 digest)  ->', await call(digest), '(0x1626ba7e = valid)')
console.log('isValidSignature(struct hash only)->', await call(hashDelegation(d)), '(expected invalid)')
