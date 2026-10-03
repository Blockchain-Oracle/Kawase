/**
 * Kawase's public addresses (domain getkawase.xyz, bought 2026-10-02; the sslip.io hosts stay as aliases): where a person or a judge reaches each surface (deploy/coolify.md "Planned
 * applications"; Android build from deploy/android.md, 2026-10-02). The docs and the landing read these, so a link
 * changes in one place. `testFlight` stays null until a public TestFlight link exists; surfaces then say
 * "invite only" instead of inventing one.
 */
export const PUBLIC_LINKS = {
  webApp: "https://app.getkawase.xyz",
  api: "https://api.getkawase.xyz",
  docs: "https://docs.getkawase.xyz",
  landing: "https://getkawase.xyz",
  github: "https://github.com/Blockchain-Oracle/kawase",
  /** Where a person reports a problem (no support mailbox exists yet; the repository's issues are public and watched). */
  support: "https://github.com/Blockchain-Oracle/kawase/issues/new",
  /** EAS preview build e644e19d (universal APK). Do not use fc084aa7 (blank-screen bug). */
  androidApk: "https://expo.dev/accounts/abu.dev/projects/kawase/builds/e644e19d-72ca-4afd-b212-cf35a98b56ed",
  testFlight: null as string | null,
  /** The Tauri desktop app for Apple-silicon Macs (apps/desktop), served by the landing from public/download. */
  desktopMac: "https://getkawase.xyz/download/Kawase-mac.dmg",
} as const;

/**
 * Block explorers for the chains Kawase's evidence lives on (context/01-arc/network-config.md: Arc's Blockscout;
 * testnet.arcscan.app is ArcScan's testnet host and redirects to explorer.testnet.arc.io).
 */
export const EXPLORERS = {
  arc: "https://explorer.arc.io",
  arcTestnet: "https://testnet.arcscan.app",
  baseSepolia: "https://sepolia.basescan.org",
  arbitrumSepolia: "https://sepolia.arbiscan.io",
} as const;
export type ExplorerId = keyof typeof EXPLORERS;

export const explorerTxUrl = (explorer: ExplorerId, hash: string): string => `${EXPLORERS[explorer]}/tx/${hash}`;
export const explorerAddressUrl = (explorer: ExplorerId, address: string): string =>
  `${EXPLORERS[explorer]}/address/${address}`;
