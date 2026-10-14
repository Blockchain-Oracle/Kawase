# On-ramp accounts: what Codex found in the consoles (2026-10-14)

Source: the Codex run of `plan/prompts/codex-2026-10-14-onramp.md`, reported by Abu.

**Coinbase Developer Platform**
- Project "Kawase" exists. Keys are in `.env`: `CDP_PROJECT_ID`, `EXPO_PUBLIC_CDP_PROJECT_ID`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`.
- Onramp is in trial mode: **25 test transactions, each capped at $5**. Full access needs an application.
- The application form asks for:
  - project or business name;
  - primary operating country;
  - website;
  - products;
  - intended uses;
  - whether the project is an aggregator serving downstream partners;
  - a use-case description.
  A second page, "Implementation & Compliance", was not opened. Nothing was submitted.
- The redirect origins are saved.

**Circle Console (Onramp)**
- Circle asks for a **production web domain** to enable **bank transfer**, and presents business verification (KYB) as a later step for card, Apple Pay and Google Pay.
- The KYB questionnaire is locked until the domain step is done, so company-versus-individual eligibility, documents and review time are still **unverified**. Nothing was submitted.
- Bank transfer appears available before KYB once the domain is registered (Arc FAQ: https://help.arc.io/support_arc/en/arc-portal-faqs?id=arc_article_view&sysparm_article=KB0011405).
- Next step: `plan/prompts/codex-2026-10-14-circle-domain.md` registers `app.getkawase.xyz`.

**What it means for the buy flow (D42)**
- Circle: bank transfer can go live without a company. Card, Apple Pay and Google Pay wait on KYB.
- Coinbase: Apple Pay for US users works in trial (≤ $5 each, 25 total). Enough for the demo and for US judges.
