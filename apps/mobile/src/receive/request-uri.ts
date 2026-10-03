// The request-with-amount code (money-in.md "Receive"; gaps.md G10): an EIP-681 transfer URI — token, chain, recipient
// and amount in base units — that any wallet scanning it fills in, and that Kawase's own scanner reads back
// (apps/api/src/paycodes/parse.ts). The bare address stays the default code, since it scans everywhere.
import { getAddress } from "viem";

export function transferUri(token: string, chainId: number, recipient: string, units: bigint): string {
  return `ethereum:${getAddress(token)}@${chainId}/transfer?address=${getAddress(recipient)}&uint256=${units.toString()}`;
}
