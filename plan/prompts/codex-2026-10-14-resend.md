# Codex task: Resend for Kawase's email notifications (2026-10-14)

You are working for Abu, owner of Kawase (repo `/Users/abu/dev/hackathon/tamion`). He asked for this himself: set it up with computer use, without waiting for his permission at each step.
- He has accepted all terms and conditions.
- Use his **Zen browser** (`/Applications/Zen.app`) with his **Blockchain Oracle Google account** ("Continue with Google").
- Run in the background and finish on your own.

## Hard rules
- **Free plan only.** Never enter a card.
- **Never print the API key**, in the terminal, your messages or any file other than `.env`.
- Write keys only into `/Users/abu/dev/hackathon/tamion/.env` (git-ignored). Replace the line if the name exists, otherwise append it. Touch no other line.
- Never commit, push or change code. **Do not edit DNS yourself**; Claude sets the records.

## Steps
1. Go to https://resend.com and sign up / sign in with Google (free plan).
2. **Domains → Add domain:** `getkawase.xyz` (default region).
   - Resend will show DNS records: an MX record, SPF TXT and DKIM TXT on subdomains such as `send` and `resend._domainkey`, maybe a DMARC suggestion.
   - Copy every record exactly (type, host/name, value, priority) into `/Users/abu/.config/kawase/resend-dns.txt`, one per line: `TYPE<TAB>HOST<TAB>VALUE<TAB>PRIORITY`. This file is outside the repo.
   - Leave the domain page open. Don't click Verify until Claude has added the records; Claude will check.
3. **API Keys → Create API key:** name `kawase`, permission "Sending access" for `getkawase.xyz` (or Full access if that is the only option). Write `RESEND_API_KEY=<key>` to `.env`.
4. Write `EMAIL_FROM=Kawase <hello@getkawase.xyz>` to `.env`.

## Finish
Run this, which prints names only:

`grep -o -E '^(RESEND_API_KEY|EMAIL_FROM)=' /Users/abu/dev/hackathon/tamion/.env`

Then `wc -l /Users/abu/.config/kawase/resend-dns.txt`.

End with a short summary: which names are set, how many DNS records you saved, and anything skipped.
