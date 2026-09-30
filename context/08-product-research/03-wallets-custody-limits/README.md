# 03 — Wallets, custody and spending limits (index and summary)

Purpose: summary and decision matrix for how a consumer and small-business AI agent app (iOS, Android, desktop) holds and moves USDC on Arc with spending limits, background automations and an agent acting for the user.

Sources: the files below and the raw evidence in `.firecrawl/product/03-wallets/`. Live RPC checks against `rpc.mainnet.arc.io` (5042) and `rpc.testnet.arc.io` (5042002) ran on 2026-09-29. Rules: `../RESEARCH-RULES.md`.

Verified: 2026-09-29

## Files

| File | What's in it |
|---|---|
| [circle-wallet-options.md](circle-wallet-options.md) | Circle user-controlled, modular, developer-controlled and Agent Wallets, plus Gas Station: keys, background signing, limits, Arc support, SDK versions, pricing, KYC. Re-checks why arc-agent rejected Circle wallets. |
| [third-party-wallet-infra.md](third-party-wallet-infra.md) | Privy, Dynamic, Turnkey, CDP, Crossmint, thirdweb, Web3Auth, Para, Magic, Openfort, Biconomy, ZeroDev, Safe, Rhinestone, MetaMask DF, Reown AppKit, and the bundler probes |
| [delegation-session-keys-limits.md](delegation-session-keys-limits.md) | ERC-7710/7715, session keys, Smart Sessions, ZeroDev policies, and which limit types each can enforce on Arc, with deployed addresses |
| [aa-infra-on-arc.md](aa-infra-on-arc.md) | EntryPoints v0.6–v0.9, P256 precompile, bundlers, paymasters and account factories, all verified on chain |
| [mobile-security-ux.md](mobile-security-ux.md) | Secure Enclave/Keystore, passkeys, confirmation screens, address poisoning, recovery and export |
| [recommended-architectures.md](recommended-architectures.md) | Three architectures (A/B/C), the matrix and the recommendation [INFERENCE] |

## Ten findings

1. **No Circle wallet can give an agent a scoped key that works while the user is away.**
   - User-controlled and modular wallets need the user present for every signature.
   - Developer-controlled wallets can sign unattended, but that is full app custody with no policy engine.
   - Agent Wallets have real per-tx/daily/weekly/monthly caps and allowlists. They are CLI-only, one human per session, the caps are **mainnet only**, and changing them needs a human email OTP. [VERIFIED, `circle-wallet-options.md`]
2. **Circle now supports Arc mainnet.** Wallets, Gas Station, Contracts and Agent Wallets added `ARC` on 2026-09-16. Circle's modular-wallet contracts (MSCA factory, WebAuthn multisig, Address Book) and the Gas Station paymaster have code on both networks. [VERIFIED]
3. **Passkeys can sign onchain on Arc.** The P256VERIFY precompile at `0x100` returns `1` for a valid P-256 signature and empty for a tampered one, on mainnet and testnet. arc-agent's "no RIP-7212" conclusion came from `eth_getCode`, which is always empty for precompiles, so it was wrong. [VERIFIED]
4. **The MetaMask Delegation Framework v1.3.0 (ERC-7710) is deployed on both Arc networks.** That includes the DelegationManager, the HybridDeleGator (which accepts passkey signers), the 7702 DeleGator, and enforcers for periodic ERC-20 budgets, recipient, target, method, time, use count and redeemer. The published SDK knows only testnet; mainnet support is merged but unreleased. MetaMask's ERC-7715 "Advanced Permissions" does not list Arc. [VERIFIED]
5. **ZeroDev Kernel v3 and its policies (Call, RateLimit, Timestamp) and the Safe AllowanceModule have code on both networks.** ZeroDev's SpendingLimitHook is absent. [VERIFIED]
6. **Rhinestone Smart Sessions and Biconomy Nexus are testnet-only on Arc.** Their mainnet addresses are empty, and Biconomy's newest Nexus is on neither network. Coinbase Smart Wallet is mainnet-only, and Coinbase's SpendPermissionManager is on neither. [VERIFIED]
7. **Bundlers and paymasters:**
   - Pimlico's public bundler answers for 5042 and 5042002 with EntryPoints v0.6–v0.9. [VERIFIED]
   - Alchemy's docs list both networks. [VERIFIED docs]
   - Circle Gas Station's paymaster is funded on EntryPoint v0.6 (about 7.9k USDC on mainnet, 5.8k on testnet). [VERIFIED]
   - The permissionless Circle Paymaster is not on Arc. [VERIFIED]
   - Delegations can also be redeemed by a plain EOA transaction paying USDC gas, with no bundler. [INFERENCE from ERC-7715 text]
8. **Among third parties, Turnkey and Privy have the best Arc evidence plus background signing under a default-deny policy engine.** Neither documents rolling daily or weekly budgets. Dynamic's delegated access needs the Enterprise plan in production. CDP has no managed Arc support, Openfort doesn't list Arc, and Web3Auth, Para and Magic are custom-chain only. [VERIFIED/REPORTED, `third-party-wallet-infra.md`]
9. **Phones can't be the scheduler.** iOS does not guarantee background task timing. Automations need a server worker that holds only a scoped credential. [VERIFIED Apple doc; INFERENCE for design]
10. **Address poisoning is the big consumer risk** (USENIX '25: 270M attacks, at least $83.8M in losses). The defences are to resolve recipients only from contacts, hide dust from history, run lookalike checks, and pin recipients onchain for automations. [VERIFIED paper; INFERENCE for defences]

## Decision matrix (detail and evidence in `recommended-architectures.md`) [INFERENCE]

| | A: Circle envelope (UCW + dev-controlled allowance wallet) | B: Passkey smart account + ERC-7710 delegations | C: Turnkey/Privy + provider policy |
|---|---|---|---|
| User wallet | Circle UCW (RN/iOS/Android/Web SDKs) | HybridDeleGator / Kernel owned by the device passkey | Provider embedded wallet |
| Agent authority | Allowance balance (hard) + app rules | Onchain caveats: period budget, recipient, target, expiry | Provider server signer + policy |
| Automations | Worker signs from the allowance wallet | Worker redeems per-automation delegations | Worker signs through the provider API |
| Onchain-enforced limits | Balance only | **Yes** | No (provider-side) |
| Custody | UCW non-custodial; allowance custodial | Non-custodial | Vendor enclave/MPC |
| Arc mainnet readiness | Live products | Contracts deployed, flow unproven | Arc artefacts, flow untested |
| Circle-tool credit | High | Medium | Low–medium |
| Hackathon build risk | Low | High | Low–medium |

**Recommendation [INFERENCE]:** build A now. In week 1, spike B on testnet: grant, redeem, over-limit revert, wrong-recipient revert, expiry, revoke. If the spike passes, make the agent's allowance account a passkey-owned DeleGator funded from the Circle UCW vault. That keeps Circle Wallets central and puts the limits in contracts (RFB 4). If it fails, keep A and label the limits as app-enforced.

## Top gaps

- No delegation or session flow has been executed on Arc **mainnet** by anyone we can cite. On testnet, the only E2E evidence is Biconomy Smart Sessions (July 2026), from a build that failed.
- React Native passkey and WebAuthn plumbing, and Android domain association, are unverified.
- Rolling-budget support in the Privy and Turnkey policy engines is unknown.
- The legal and regulatory posture of a custodial allowance wallet was not researched.
