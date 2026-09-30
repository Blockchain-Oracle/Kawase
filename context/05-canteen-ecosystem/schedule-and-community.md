# Tameion programming schedule and community links

Purpose: the two-week programming calendar (from the kickoff slides) and every community and registration link, with the conflicting Discord invites resolved.

Sources: `.firecrawl/kickoff-slides.txt` (Programming slide), `.firecrawl/tameion.md`, `.firecrawl/luma.md`, Discord public invite API (`https://discord.com/api/v10/invites/<code>?with_counts=true`, no auth), community.arc.io event page.
Verified: 2026-09-29

---

## Schedule (all times ET; firesides are 20 min; "more being added, follow Discord")

| Date | Time | Session | Notes |
|---|---|---|---|
| Sun Sep 27 | 10:00 | **Kickoff** | Aljoša Makević; the deck text is at `.firecrawl/kickoff-slides.txt` |
| Sun Sep 27 | 11:00 | **Arc 101** | Canteen/Circle intro to Arc, the Agent Stack and nanopayments. The Lepton Arc 101 used [these slides](https://docs.google.com/presentation/d/12O6VpbrANvSKgO-Fw1ClDM6DRzUvMPo0ejUyhr605DE/edit) plus the `the-canteen-dev/circle-agent` repo; Circle's public "Arc 101" YouTube series is transcribed in `transcripts/` |
| Mon Sep 28 | 09:00 | Fireside: **Earljoe Kadima** | |
| Mon Sep 28 | 10:00 | **Arc office hours** | |
| Tue Sep 29 | 09:00 | **Kickoff repeat** | |
| Tue Sep 29 | 10:30 | **aomi session** | See `aomi.md` |
| Tue Sep 29 | 11:00 | **aomi office hours** | Ask whether aomi supports Arc (5042002) |
| Wed Sep 30 | 09:30 | Fireside: **Martin Blais** (Beancount) | Ledgers and agents; read Agents & Ledgers first |
| Thu Oct 1 | 09:30 | Fireside: **Ahmet Erdoğan** | |
| Fri Oct 2 | 09:00 | Fireside: **Tang Minh Vu** | Lepton 1st (Keryx), Agora standout |
| Fri Oct 2 | 10:00 | Fireside: **Ivan Barcia** | |
| Sat Oct 3 | 10:00 | **Mid-point check-in** | A good moment to run `arc-canteen update-traction` / `update-product` |
| Sun Oct 4 | — | — | |
| Mon Oct 5 | 10:00 | **Arc office hours** | |
| Tue Oct 6 | 11:00 | **aomi office hours** | |
| Wed Oct 7 – Fri Oct 9 | — | — | |
| **Sat Oct 10** | **23:59** | **Submissions due** | forms.gle/BBWrdfuircrKiG2i6: public repo (required), demo video under 3 min (required), live link (encouraged), traction answers. Submit early and often; resubmission is allowed |

Session join links and recordings are posted in the Canteen Discord, which cannot be read without logging in. As of 2026-09-29 no public recordings of Tameion sessions were found on YouTube, Luma, the Canteen site or Arc House.

## Registration

- Luma: https://luma.com/ivroypr5, **passphrase `DIRECTx42490`** (public on the slides). 369 going as of the scrape. Enter your GitHub and Discord handles accurately, because submissions are collated by them.
- Hackathon site: https://tameion.thecanteenapp.com
- Also listed on Arc House (Circle's community platform): https://community.arc.io/public/events/tameion-agents-hackathon-jb1w9clwx7

## Community

| Channel | Link | Notes |
|---|---|---|
| **Canteen Discord** | https://discord.gg/rsVfYutFZg (tameion site, also Lepton) **or** https://discord.gg/bDaEfsSqc8 (Luma and slides) | **Both invites resolve to the same server**: "Canteen", guild id 1459162854069375120, about 1,892 members, invites don't expire (checked 2026-09-29). Agora's `discord.gg/TGnyfKh23V` points to the same server too. Either works. |
| **Arc builder Discord** | https://discord.com/invite/buildonarc | "Build on Arc", about 22.7k members. **Mention "Canteen + Tameion" in onboarding**; if rejected, ping **@kdrohan** in the Canteen Discord. |
| Arc House (forum) | https://community.arc.io | Circle's Arc community site: events, content, discussions. |
| aomi Discord | https://discord.gg/uk5ZAMuepJ | "Aomi Labs", about 52 members. |
| Canteen on X | https://x.com/thecanteenapp | Announcements. |
| Circle Agent Stack | https://agents.circle.com · https://developers.circle.com/agent-stack | `npm install -g @circle-fin/cli` (Node ≥ 20.18.2). |
| Arc docs | https://docs.arc.network (now docs.arc.io) | |
| Arc Showcase | https://arc-showcase.thecanteenapp.com · criteria https://arc-oss.thecanteenapp.com | `arc-canteen submit-showcase` |

Discord message content (announcements, session links, puzzles) requires login and was not scraped. Check #announcements for newly added firesides and easter-egg puzzles (`arc-canteen submit-puzzle`).
