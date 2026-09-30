# Arc House, Architects, and community programs

Purpose: what Arc House and the Architects program are (Abu's "arcade school"), how the points and tiers work, what the airdrop and ARC-token situation actually is, and which community programs are running now. Users will ask the agent about all of this.

Sources:
- https://community.arc.io (scrape: `.firecrawl/product/census/arc-house.md`)
- https://www.arc.io/blog/introducing-arc-house-and-the-architects-program (`architects-blog.md`)
- https://community.arc.io/public/resources/architects-tiers-and-benefits (`ah-public_resources_architects-tiers-and-benefits.txt`)
- https://community.arc.io/public/resources/architects-contribution-opportunities (`ah-public_resources_architects-contribution-opportunities.txt`)
- https://community.arc.io/public/resources/architects-overview (`ah-public_resources_architects-overview.txt`)
- https://community.arc.io/public/resources/architects-roles (WebFetch summary, 2026-09-29)
- https://community.arc.io/home/resources/architects-terms-and-conditions (`architects-terms.md`)
- https://community.arc.io/public/events (`ah-public_events.txt`), https://community.arc.io/public/clubs (`ah-public_clubs.txt`)
- https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq (`event-microgrants.md`), https://community.arc.io/public/events/arc-acceleration-season-vanemu91dk (WebFetch)
- Circle mainnet press release (`press-mainnet.md`), Arc mainnet blog (`arcio-blog-mainnet.md`)
- ARC token whitepaper PDF, May 2026 (`arc-token-whitepaper.txt`), https://www.arc.io/arc-token-whitepaper (WebFetch)
- https://en.cryptonomist.ch/2026/09/17/arc-network-airdrop-guide/ (`cryptonomist-airdrop.md`)
- All local paths are under `.firecrawl/product/census/`.

Verified: 2026-09-29

## 1. What Arc House is

- **Arc House** is Arc's official community hub at https://community.arc.io, run on the Gradual platform ("Powered by Gradual"). [VERIFIED] (`arc-house.md:43`)
- It launched on **2026-03-31**, together with the Architects program. [VERIFIED] (`architects-blog.md`, dated "March 31, 2026")
- The official blog says it contains "Educational content, videos, articles, and ongoing discussions", "Virtual and in-person event registration", "Community programs, spotlights, and announcements", "Member activity tracking and recognition", and "Community interest groups and regional meetups". [VERIFIED] (`architects-blog.md:82-87`)
- Navigation: Home, Arc Discord (discord.gg/buildonarc), Arc Docs, Discussions, Events, Content, Albums, Groups. [VERIFIED] (`arc-house.md:11-41`)
- Size: Circle claims "more than 75,000 active Arc House members and 10,000 Architect ambassadors, who have built more than 1,200 projects on Arc". [REPORTED, Circle's own claim] (`press-mainnet.md`, line 965 of the raw scrape)
- Topic groups visible publicly: **Agentic Economy** (11,287 members), **Architects** (10,467), **Hackathons** (10,277). Regional **Chapters** exist (filters: Asia & Pacific, Africa, Latin America, Europe & Middle East), but the chapter list loads client-side and was not captured. [VERIFIED counts / UNKNOWN chapter list] (`ah-public_clubs.txt`)

"Arcade school" = **Arc House**. [INFERENCE from Abu's description plus the earlier search `.firecrawl/search-arc-arcade.json`, whose top hit is community.arc.io]

## 2. The Architects program

- It is "Arc's ambassador program recognizing individuals who actively contribute to the growth and success of the Arc ecosystem". It is **not application-based**: "If you are contributing, participating, and showing up for the community, you will earn points and grow within the program." [VERIFIED] (`ah-public_resources_architects-overview.txt`)
- Operator: Circle Technology Services, LLC. Contact: architects@arc.network. [VERIFIED] (`architects-terms.md:69`)

### Tiers (points thresholds and benefits)

[VERIFIED] (`ah-public_resources_architects-tiers-and-benefits.txt`, page "Last updated on September 4, 2026")

| Tier | Points | How reached | Key benefits (cumulative) |
|---|---|---|---|
| 0 | 0 | Register an Arc House account | None |
| 1 | 500 | 500 points **and** opt in by accepting the Terms. You then become an "Architect". | Architect topic group, tier badge, Architect-only events and offers, recognition, a chance to join Arc booth teams, and eligibility to apply for Meetup Organizer or Technical Speaker |
| 2 | 3,500 | Automatic | Member Spotlight, quarterly Tier 2+ briefings with Arc/Circle, priority registration, can apply for Community Moderator, feedback roundtables |
| 3 | 15,000 | Automatic | Architect Member Showcase stage slot, VIP lists at select in-person events |
| 4 | 40,000 | Automatic | Quarterly private project advisory session with Circle, auto ticket to every Architect Builder Summit |
| 5 | 90,000 | Automatic | Homepage recognition, quarterly Tier 5 roundtable, private events with Circle Ventures and VCs, Builder Summit ticket plus travel stipend eligibility |

### How points are earned ("quests")

The official list is called **Contribution Opportunities**. It has no "quests" by that name. [VERIFIED] (`ah-public_resources_architects-contribution-opportunities.txt`, "Last updated on September 14, 2026")

| Activity | Points |
|---|---|
| ID Verified (completed identity verification) | 50 |
| Finish Onboarding (profile) | 50 |
| Hackathon Participant (after 2026-03-31) | 500 |
| Hackathon Winner | 1,000 |
| Developer Challenge win | 100 |
| Developer Bounty win | 150 |
| Partner Bootcamp (Arc × Encode, batched monthly) | 300 |
| Accelerator graduate (Crecimiento or Encode) | 2,000 |
| Daily Active (once per day) | 1 |
| Arc Product Beta Tester (approved feedback) | 200 |
| Arc Technical Beta Tester (Verified Arc Developers, "role coming soon") | 300 |
| Circle Grant Recipient | 2,000 |
| Course Champion ("Arc House courses coming soon!") | 200 |
| Join a Club | 20 |
| Author (approved guest post) | 500 |
| Watch a Video (≤4 per 24h) | 4 |
| Read Content (≤5 per 24h) | 2 |
| Comment/Reply (≤2 per 24h) | 5 |
| Publish a Post (≤1 per 24h) | 10 |
| Accepted Answer (≤1 per 24h) | 30 |
| Organized an Arc Meetup (Meetup Organizer role) | 1,000 |
| Hosted a Virtual Chapter Event (Chapter Lead role) | 500 |
| Arc Community Speaker | 500 |
| Virtual Event Participation | 20 |
| In-Person Event Participation (check-in required) | 200 (the page renders it as "2 / 00"; see note) |
| **Planned:** "Verified Arc Builder" (onchain tracking) | "Coming soon; verification process and reward to be determined" |

Note: the in-person value shows as "2" and "00" on separate lines in the page text. I read it as 200. [INFERENCE]

Hackathon relevance: the Tameion Agents Hackathon is itself listed as an Arc House event (Sep 27 – Oct 10, 2026), so participation should count as "Hackathon Participant" (500 points). [VERIFIED listing (`arc-house.md:55-61`); points eligibility is INFERENCE]

### Roles

[VERIFIED via WebFetch summary of https://community.arc.io/public/resources/architects-roles; overview page confirms the role names]

| Role | Eligibility | Notable benefits |
|---|---|---|
| Architect | Tier 1+ | Tier badge |
| Meetup Organizer | Tier 1+, event experience, local network | Reimbursement of pre-approved event expenses |
| Technical Speaker | Tier 1+ or invited experts with hands-on Arc experience | Speaking invitations, some travel reimbursement |
| Community Moderator | Tier 2+, appointed Chapter Lead, or invited | Moderation in Arc House and Discord |
| Chapter Contributor | Any active regional chapter member | Badge; "1,000 Arc House points per month for helping a chapter" |
| Chapter Lead | Application, selection, or invitation | 500 points per virtual event, 1,000 per in-person; cap 3,500 per month |
| Country Lead | Application plus country-level ecosystem experience | 500 or 1,000 points per event; cap 5,000 per month |

The Cryptonomist guide mentions a "Creator role". It does **not** appear in the official roles list. [REPORTED claim, contradicted by the primary source]

### KYC

Terms: "Depending on your status in the Program, including your Tier level, you may be required ... to successfully complete the Company's KYC screening process." [VERIFIED] (`architects-terms.md:141`)

## 3. Airdrop, points, and the ARC token (what the agent should say)

The agent must be accurate here. Users will ask "how do I farm the Arc airdrop?"

1. **Points are explicitly not airdrop eligibility.** Tiers page: "Architect points have no monetary value and do not represent or guarantee eligibility for tokens, financial rewards, or an airdrop." [VERIFIED]. The Terms add: "Points ... cannot be redeemed for cash, USDC or any other virtual currency" and "Points will not be converted into any form of legal tender or any future rewards offered by the Company." [VERIFIED] (`architects-terms.md:131`). The Terms also say nothing in the program grants "any right, entitlement or expectation to receive ... any tokens ... including without limitation in the form of any airdrop". [VERIFIED] (`architects-terms.md:259`)
2. **An ARC token exists on paper and was minted, but it has not launched.**
   - Circle "completed the genesis mint of ARC token this week in the U.S., creating the full initial supply of 10 billion tokens". "This initial mint is not a commitment to publicly launch ARC." PoS transition is being explored "in 2027". [VERIFIED] (Circle press release, 2026-09-16)
   - arc.io/arc-token-whitepaper: "No ARC token has been launched, and any discussion of a potential ARC token is merely exploratory." [VERIFIED via WebFetch]
   - Whitepaper (May 2026) indicative allocation: **60% Ecosystem** ("token sales, developer grants, network growth programs, and broader participation mechanisms"), **25% Circle**, **15% Long-Term Reserve**. "Exact unlock and release schedules will be announced in the coming months." [VERIFIED] (`arc-token-whitepaper.txt:492-523`). Planned inflation starts at "approximately 2–3%", with fee burns. [VERIFIED] (`arc-token-whitepaper.txt:346-347`)
   - Fees stay in USDC even if ARC launches. [VERIFIED] (press release)
3. **No airdrop has been announced.** No date, no claim process, no eligibility list. [REPORTED: Cryptonomist 2026-09-17; UNKNOWN on primary sources, because I found no Circle statement that announces one]
4. A **$222M private ARC presale at a $3B FDV** is reported, citing "Circle's Q1 2026 results release". [REPORTED; I did not open the Circle Q1 release]
5. Scam risk: onchain tokens named "Architects" (`0x8bcb94279FC2c984EC34e0C1f2192df8c69EA4F0`, 1B supply) and "Arcade" trade on Arc mainnet. They are not Circle's. See [tokens-and-assets.md](tokens-and-assets.md). [VERIFIED these tokens exist (LI.FI list, RPC `name()`); INFERENCE that they are not official, because no Circle source lists them]

Suggested agent stance [INFERENCE]: explain Arc House and points honestly, link the official pages, never promise an airdrop, and warn about fake "ARC" or "Architects" tokens.

## 4. "Arc Academy" / learning track

- **No official "Arc Academy" found.** I searched the web ("Arc Academy" Circle Arc) and Arc House. The only "ARC Academy" hit is an unrelated game-dev school on Instagram. [UNKNOWN → treat as non-existent] (`.firecrawl/search-arc-arcade.json`, WebSearch 2026-09-29)
- What exists instead:
  - **Arc House courses**: "Arc House courses coming soon!" (Course Champion, 200 points). Not live yet. [VERIFIED]
  - **Arc × Encode "Programmable Money on Arc Bootcamp"** (300 points on graduation): https://www.encodeclub.com/programmes/arc-bootcamp [VERIFIED listed in contribution opportunities; bootcamp page REPORTED via search]
  - **Accelerators**: Crecimiento, Encode Accelerator (2,000 points). [VERIFIED listed]
  - Arc House **Content** (blogs and videos, e.g. "Building with StableFX on Arc", Onramp Kit and Interop posts). [VERIFIED] (`arc-house.md:89-127`)
  - Office hours and "Build Clubs" by region (e.g. Bangladesh Build Club: Explore Arc Studio). [VERIFIED] (`ah-public_events.txt`)

## 5. Community programs running now (as of 2026-09-29)

[VERIFIED from `ah-public_events.txt` and the event pages]

| Program | Dates | What |
|---|---|---|
| **Tameion Agents Hackathon** | Sep 27 – Oct 10, 2026 | This hackathon (online) |
| **Arc Microgrants** | Sep 16 – Oct 14, 2026 (decisions by Oct 21) | "Twenty microgrants of 500 USDC each ... from a 10,000 USDC pool" for projects "deployed and working on Arc mainnet". Submit via https://dorahacks.io/hackathon/arc-microgrants. Testnet-only builds are not eligible. |
| **Arc Acceleration Season** | Sep 22 – Oct 24, 2026 | Six-week online program for LatAm fintech and AI startups. Applications closed Sep 22. |
| The Agentic Economy Prize | May 19 – Sep 25, 2026 | Ended |
| Dev Days Cafe (SF) | Sep 29 | In person |
| Technical Office Hours | Oct 1 | Webinar |
| Regional meetups | Oct–Nov | Da Nang (Oct 11), London co-working (Oct 12), Encode London (Oct 23), London demos (Oct 26), Pragma Mumbai (Nov 5), ETHGlobal Mumbai (Nov 6–8) |

Also mentioned: the **Circle Grant Program** (the microgrants page routes larger projects there) and the "Arc Builders Fund" (Arc House post: "Tradable joins the Arc Builders Fund"). [VERIFIED mentions; program terms not researched]

Agent hook [INFERENCE]: the agent could surface open programs ("Microgrants close Oct 14, and your deployed contract may qualify"). There is no public API. Events are HTML on Gradual.

## 6. Can an agent integrate with Arc House?

- No public API or SDK found. Pages render server-side HTML (curl works), so public events and resources could be scraped. Sign-in is required for member actions. [VERIFIED HTML fetch; API UNKNOWN]
- Points and tier data per user are behind sign-in. [INFERENCE]
