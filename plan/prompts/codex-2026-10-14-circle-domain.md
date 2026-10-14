# Codex task: register Kawase's production domain in the Circle Console (2026-10-14)

You are working for Abu, owner of Kawase. He asked for this himself: do it with computer use, without waiting for his permission at each step.
- He has accepted all terms.
- Use his **Zen browser** with his **Blockchain Oracle Google account** at https://console.circle.com, the same account you used earlier today.

## Goal
Circle's Onramp asks for a **production web domain** to enable **bank transfer** (it works before business verification). Register Kawase's domain so bank transfer goes live.

## Steps
1. Open the Onramp / App Kits area where you saw the "production web domain" request earlier today.
2. Enter **`app.getkawase.xyz`**. If it accepts several, also add `getkawase.xyz`. If it asks for a full URL, use `https://app.getkawase.xyz`.
3. Save. If Circle asks to verify the domain (a DNS TXT record or a file), **don't guess**. Copy the exact record or file instructions into `/Users/abu/.config/kawase/circle-domain-verify.txt` (type, host, value, or the file path and contents) and stop; Claude adds it.
4. **Do not** start or submit the business verification (KYB) questionnaire, and don't enter any company or identity details.

## Rules
Free only, no card, never print secrets, no code or repo changes.

## Finish
A short summary:
- whether the domain saved;
- whether bank transfer now shows as enabled (for sandbox and/or production);
- whether a verification record was needed (and that you saved it to the file above);
- anything else the page asked for.
