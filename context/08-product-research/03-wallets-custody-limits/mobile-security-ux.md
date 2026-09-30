# Mobile security UX: biometrics, passkeys, confirmations, address poisoning, recovery, export

Purpose: the security-UX facts that constrain a phone-first (iOS/Android) and desktop wallet+agent app on Arc, and the patterns they imply.

Sources:
- Apple: "Protecting keys with the Secure Enclave" (https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave, JSON saved `.firecrawl/product/03-wallets/apple-secure-enclave.json`); "Supporting passkeys" (https://developer.apple.com/documentation/authenticationservices/supporting-passkeys, `apple-passkeys.json`); `BGTaskRequest.earliestBeginDate` (https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate, `apple-earliestbegindate.json`)
- Android: Keystore (https://developer.android.com/privacy-and-security/keystore); Credential Manager (https://developer.android.com/identity/sign-in/credential-manager, `android-credman.html`)
- Arc: `p256-precompile-check.txt` (live `eth_call` to `0x100`), `docs.arc.io/arc/references/evm-differences` and Memo page (`.firecrawl/docs/arc-llms-full.txt:18295-18395, 17405-17430`)
- Address poisoning: Tsuchiya et al., "Blockchain Address Poisoning", USENIX Security '25, https://arxiv.org/abs/2501.16681
- ERC-7730 clear-signing format: https://github.com/ethereum/ERCs/blob/master/ERCS/erc-7730.md
- Circle wallet recovery/export: `circle-wallet-options.md` (this folder) and the Circle docs pages it cites
- MetaMask HybridDeleGator: `github.com/MetaMask/delegation-framework/documents/HybridDeleGator.md`
- Lessons: `context/07-prior-work/arc-agent-lessons.md` #11, #39, #41

Verified: 2026-09-29

---

## 1. Device keys, biometrics and passkeys

| Fact | Status / source |
|---|---|
| iOS Secure Enclave "works only with NIST P-256 elliptic curve keys", and "when you protect a private key with the Secure Enclave, you never handle the p[rivate key]". Access can be gated with `SecAccessControlCreateFlags.biometryAny` ("Touch ID for any enrolled fingers, or Face ID"). | [VERIFIED] Apple Secure Enclave doc |
| Android Keystore: "key material remaining non-exportable"; StrongBox lists "ECDSA, ECDH P-256"; keys can be bound to user authentication either time-based or "each operation … individually authorized by the user". secp256k1 is not listed. | [VERIFIED] Android Keystore doc (secp256k1 absence is [INFERENCE] from the list) |
| Passkeys "use iCloud Keychain public key credentials … rely on biometric identification, such as Touch ID and Face ID". iOS needs "an associated domain with the `webcredentials` service type" or the request errors. | [VERIFIED] Apple passkeys doc |
| Android passkeys go through Credential Manager. | [VERIFIED] page structure; Android's domain-binding requirement (Digital Asset Links) not re-checked [UNKNOWN] |
| **Arc verifies P-256 natively**: `eth_call` to P256VERIFY `0x…0100` returned `…01` for a valid signature and `0x` for a tampered one, on both mainnet and testnet. | [VERIFIED] `p256-precompile-check.txt` |

Consequence [INFERENCE]: hardware keys on phones are P-256, Ethereum EOAs are secp256k1. So a phone's Secure Enclave/StrongBox/passkey **cannot be an EOA key**, but it **can** own a smart account on Arc (Circle MSCA WeightedWebAuthnMultisig, MetaMask HybridDeleGator "NIST P256 … WebAuthn P256", Rhinestone WebAuthnValidator, Kernel/ZeroDev passkey validators; see `delegation-session-keys-limits.md`). This gives "Face ID to approve a payment" with the key never leaving the device, and it's cheap because the precompile exists.

Passkeys bind to a domain (relying party). You need a real domain with associated-domains / asset-links set up for iOS, Android and web to share one credential. Deploy the domain early (arc-agent never deployed, and its passkeys were bound to an RP domain it never chose, `arc-agent-lessons.md` #51).

Passkeys sync through iCloud Keychain / Google Password Manager, so the "device" key is really an account-synced key. That helps recovery but makes the Apple/Google account part of the threat model [INFERENCE].

MPC/embedded-wallet SDKs (Circle UCW PIN+biometrics, Privy, Dynamic, etc.) typically keep a secp256k1 share and use biometrics only to unlock it. That is a different guarantee from a Secure Enclave-held signing key [INFERENCE; provider details in `third-party-wallet-infra.md`, `circle-wallet-options.md`].

## 2. Background execution on phones

Apple: `earliestBeginDate` means the task "shouldn't start any earlier than this date. However, the system doesn't guarantee launching the task at the specified date" [VERIFIED]. So a phone cannot be the scheduler for "every Tuesday send $10". Automations must run on a server holding a **scoped** credential, and the phone's role is to grant, show, pause and revoke that scope. [INFERENCE]

## 3. Transaction confirmation screens

What the confirmation must show, and why [INFERENCE unless cited]:
- **Recipient as a contact name plus the full address** with the middle characters shown, not `0x12…ab`. Poisoners match only the start and end (below).
- **Amount in USDC and fiat. Fees as separate typed lines.** On Arc, gas is paid in USDC, so the fee is the same asset as the payment. arc-agent saw fees of 2.3–270% on tiny amounts (`arc-agent-lessons.md` #18).
- **The authority being used**: "Paid from your agent allowance: $3.40 of $10 left this week", or "Needs your Face ID: outside your limits".
- **For a grant or delegation**, a human sentence rendered from the caveats themselves, not from the model's text: "Tamion can send up to 10 USDC every 7 days to Alex (0x…), until 31 Dec. Revoke anytime." ERC-7730 (Draft) is a standard JSON format "describing how to clear-sign smart contract calls and typed messages" and is usable for this [VERIFIED status].
- **Voice is not consent for new authority.** Voice can propose. Creating or widening a limit takes a biometric tap on a rendered screen. arc-agent re-asked for confirmation after the user had already confirmed by voice (`arc-agent-lessons.md` #41).
- **Never trust model-supplied addresses or token contracts.** Resolve them from contacts or allowlists after parsing. The model once invented a token address (`arc-agent-lessons.md` #39).
- **Arc Memo data is public onchain.** Warn before putting invoice or personal text in a memo (`arc-agent-lessons.md` #11). Memo `CallFrom` also does not work from smart accounts (Arc docs: "Smart contract wallets aren't supported as the direct caller"). [VERIFIED]

## 4. Address-poisoning defenses

Evidence: USENIX Security '25 found "270M on-chain attacks targeting 17M victims" with "6,633 incidents" and "at least 83.8M USD in losses" [VERIFIED, arXiv abstract]. News reports put the largest single loss at about $50M USDT, after a victim copied a lookalike address from history [REPORTED, e.g. finance.yahoo.com "Address Poisoning Scam: One Copy-Paste Mistake Cost a Crypto Trader $50 Million"].

Defenses for an agent app [INFERENCE]:
1. **The contact book is the source of truth.** "Send to Alex" resolves only from saved contacts. Tx history is never a source of recipients.
2. **Hide zero-value and dust inbound transfers**, and tokens that aren't allowlisted, from history and from the agent's context. This stops the agent from "learning" a poisoned address.
3. **Lookalike check on every new recipient.** Warn when the first and last 4–6 hex characters match a saved contact or a past counterparty but the full address differs.
4. **First-payment friction.** A new recipient means a biometric confirmation and an optional test amount. Standing delegations can pin recipients onchain (`AllowedCalldataEnforcer` / CallPolicy / recipient allowlist), so a poisoned address cannot be paid by an automation even if the agent is fooled.
5. **Screening.** Circle Agent Wallets and the Facilitator screen for sanctions only (`context/02-circle-agent-stack/guardrails-and-policies.md` §2). That is not poisoning detection.

## 5. Recovery and export (summary; detail in `circle-wallet-options.md` and `third-party-wallet-infra.md`)

| Option | Recovery | Export |
|---|---|---|
| Circle user-controlled (PIN) | Security questions. "Circle cannot recover a lost PIN." | No raw key export documented |
| Circle user-controlled (social / email OTP) | Through the Google/Apple/Facebook account or the email account. "Email account compromise means wallet compromise." | none documented |
| Circle modular (passkey) | Optional ECDSA recovery EOA from a mnemonic, "same permissions as a passkey". "Neither Circle nor your application can recover user wallets if every credential is lost." | n/a (smart account; move funds or add owners) |
| Circle developer-controlled | App's entity secret and recovery file | App-controlled. The user has no key. |
| Smart account with passkey owner (MetaMask HybridDeleGator, Kernel, Safe, etc.) | Add a second signer: a second device passkey, a recovery EOA, or a guardian module. HybridDeleGator allows multiple signers, "only 1 signer is needed". | Ownership is portable: the user can add their own EOA/hardware wallet as signer [INFERENCE] |

UX rules [INFERENCE]:
- Require a second recovery factor before the balance or allowance passes a small threshold.
- Show "who can move this money": you, your recovery key, the agent's allowance, and the app, if it is custodial.
- The screen must say so if the product is custodial. arc-agent's A-04 did this honestly, but the custody choice itself is not a baseline, because that build failed.

## Gaps

- Did not verify React Native passkey libraries or Expo support for WebAuthn on iOS/Android.
- Did not check the Android Digital Asset Links requirement text or min API levels for passkeys.
- No first-party Arc or Circle address-poisoning data. Stablecoin-targeting statistics are from other chains.
- No wallet-simulation provider (e.g. Blockaid) verified for Arc.
