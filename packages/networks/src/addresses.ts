import type { Address } from "viem";
import type { NetworkId } from "./network-id";

/**
 * Verified Arc contract addresses. Each block cites its source; do not edit without re-verifying.
 * - Assets, CCTP, Gateway, Memo, system contracts: context/01-arc/network-config.md (checked with eth_getCode, 2026-09-29)
 * - MetaMask Delegation Framework v1.3.0 (identical on both networks):
 *   github.com/MetaMask/delegation-framework documents/Deployments.md and npm @metamask/delegation-deployments@2.0.0,
 *   bytecode checked on Arc mainnet and testnet (2026-09-29)
 */

/** Same address on both networks. */
export const SHARED_ADDRESSES = {
  /** Optional ERC-20 view (6 decimals) of the native USDC balance (18 decimals). One asset, two interfaces. */
  usdc: "0x3600000000000000000000000000000000000000",
  /** EIP-7708 emitter: a Transfer log (18 decimals) for every native USDC movement. Watch this for incoming payments. */
  nativeUsdcTransferEmitter: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
  memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
  multicall3From: "0x522fAf9A91c41c443c66765030741e4AaCe147D0",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  entryPointV07: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  /** RIP-7212 P256VERIFY precompile (passkey signatures), verified on both networks. */
  p256Verify: "0x0000000000000000000000000000000000000100",
} as const satisfies Record<string, Address>;

/** MetaMask Delegation Framework v1.3.0 (ERC-7710). Mainnet is not yet in @metamask/delegation-deployments, so pass these explicitly. */
export const DELEGATION_FRAMEWORK = {
  delegationManager: "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3",
  hybridDeleGatorImpl: "0x48dBe696A4D990079e039489bA2053B36E8FFEC4",
  eip7702StatelessDeleGator: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
  simpleFactory: "0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c",
  enforcers: {
    erc20PeriodTransfer: "0x474e3Ae7E169e940607cC624Da8A15Eb120139aB",
    erc20TransferAmount: "0xf100b0819427117EcF76Ed94B358B1A5b5C6D2Fc",
    allowedTargets: "0x7F20f61b1f09b08D970938F6fa563634d65c4EeB",
    allowedMethods: "0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5",
    allowedCalldata: "0xc2b0d624c1c4319760C96503BA27C347F3260f55",
    redeemer: "0xE144b0b2618071B4E56f746313528a669c7E65c5",
    timestamp: "0x1046bb45C8d673d4ea75321280DB34899413c069",
    limitedCalls: "0x04658B29F6b82ed55274221a06Fc97D318E25416",
    valueLte: "0x92Bf12322527cAA612fd31a0e810472BBB106A8F",
    nativeTokenPeriodTransfer: "0x9BC0FAf4Aca5AE429F4c06aEEaC517520CB16BD9",
    // Relayed batches pin their exact calls with these (code checked on both networks with eth_getCode, 2026-10-03;
    // the same addresses as @metamask/smart-accounts-kit's environment for 5042 and 5042002).
    exactExecution: "0x146713078D39eCC1F5338309c28405ccf85Abfbb",
    exactExecutionBatch: "0x1e141e455d08721Dd5BCDA1BaA6Ea5633Afd5017",
    exactCalldata: "0x99F2e9bF15ce5eC84685604836F71aB835DBBdED",
  },
} as const;

type PerNetworkAddresses = {
  eurc: Address;
  usyc: Address;
  cctpTokenMessengerV2: Address;
  cctpMessageTransmitterV2: Address;
  gatewayWallet: Address;
  gatewayMinter: Address;
  stableFxEscrow: Address;
};

export const NETWORK_ADDRESSES = {
  mainnet: {
    eurc: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    usyc: "0x8a5D989Bbb96929F689B0200f435f53dA42bF490",
    cctpTokenMessengerV2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    cctpMessageTransmitterV2: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    gatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    stableFxEscrow: "0xe2E5F173576B513d994073CCbDaCBE027d43DFe6",
  },
  testnet: {
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    usyc: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
    cctpTokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    cctpMessageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    stableFxEscrow: "0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10",
  },
} as const satisfies Record<NetworkId, PerNetworkAddresses>;

/**
 * Aave V4 on Arc mainnet (bgd-labs/aave-address-book `AaveV4Arc.ts`, CHAIN_ID 5042; every address has code on
 * mainnet and none on testnet; reserves, factors and the oracle read live 2026-10-02). Kawase Margin, earn supply and
 * borrow go through the Main Spoke by reserve id, never the shallow ERC-4626 tokenization spokes (gaps.md G22).
 * The reserves themselves (USDC, EURC, cirBTC, WETH) are read from the Spoke at run time, not listed here.
 */
export const AAVE_V4: Record<NetworkId, { coreHub: Address; mainSpoke: Address; forexSpoke: Address } | null> = {
  mainnet: {
    coreHub: "0x17288dfc86205301064577b98B02b81017e6F79C",
    mainSpoke: "0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d",
    forexSpoke: "0x4164EBCAF74670aa74C8D4F59de6157c0780F1bB",
  },
  testnet: null,
};
