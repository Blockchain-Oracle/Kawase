/**
 * Kawase's public addresses (domain getkawase.xyz, bought 2026-10-02; the sslip.io hosts stay as aliases): where a person or a judge reaches each surface (Android build from
 * deploy/android.md, 2026-10-02). The docs and the landing read these, so a link
 * changes in one place. `testFlight` is the public TestFlight link, open since Apple's beta review passed (build 21,
 * 2026-10-16).
 */
export const PUBLIC_LINKS = {
  webApp: "https://app.getkawase.xyz",
  api: "https://api.getkawase.xyz",
  docs: "https://docs.getkawase.xyz",
  landing: "https://getkawase.xyz",
  github: "https://github.com/Blockchain-Oracle/Kawase",
  x: "https://x.com/getkawase",
  /** Where a person reports a problem (no support mailbox exists yet; the repository's issues are public and watched). */
  support: "https://github.com/Blockchain-Oracle/Kawase/issues/new",
  /**
   * The APK itself (EAS preview build 30b900fe, 2026-10-15, Privy sign-in): a direct download, no Expo account. Its
   * channel (preview) serves the production branch, so it takes the same over-the-air updates as TestFlight.
   */
  androidApk: "https://expo.dev/artifacts/eas/S8YsBPctqoYNckaBSmG3YFJJgFAa-Lnfbxr_i-aR5eA.apk",
  testFlight: "https://testflight.apple.com/join/PD3fgXZx" as string | null,
  /** The Tauri desktop app for Apple-silicon Macs (apps/desktop), served by the landing from public/download. */
  desktopMac: "https://getkawase.xyz/download/Kawase-mac.dmg",
  /** The demo video on YouTube (published 2026-10-17); getkawase.xyz/demo plays it above the on-chain evidence. */
  demoVideo: "https://youtu.be/qoK2132gYN0",
} as const;

/**
 * Block explorers for the chains Kawase's evidence lives on (context/01-arc/network-config.md: Arc's Blockscout,
 * explorer.arc.io and explorer.testnet.arc.io per docs.arc.io; the old testnet.arcscan.app only redirects there).
 */
export const EXPLORERS = {
  arc: "https://explorer.arc.io",
  arcTestnet: "https://explorer.testnet.arc.io",
  baseSepolia: "https://sepolia.basescan.org",
  arbitrumSepolia: "https://sepolia.arbiscan.io",
} as const;
export type ExplorerId = keyof typeof EXPLORERS;

export const explorerTxUrl = (explorer: ExplorerId, hash: string): string => `${EXPLORERS[explorer]}/tx/${hash}`;
export const explorerAddressUrl = (explorer: ExplorerId, address: string): string =>
  `${EXPLORERS[explorer]}/address/${address}`;
