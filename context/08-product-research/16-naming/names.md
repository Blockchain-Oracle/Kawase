# Japanese product names: candidates, meaning checks, availability

Purpose: propose a Japanese name for the Arc money agent app (D24). This file lists candidates with dictionary-checked meanings, availability checks for domains, npm and GitHub, and conflicts with existing products. It ends with a top 5 and a pronunciation guide.
Sources:
- Meanings: Jisho.org API (JMdict), raw responses at `.firecrawl/product/16/jisho-<word>.json`
- Domains: registry RDAP (Verisign .com, Google .app, CentralNic .xyz, Identity Digital .ai, servers taken from the IANA bootstrap `.firecrawl/product/16/iana-rdap-dns.json`) and rdap.org → `rdap.tsv`, `rdap-direct.tsv`, `rdap*-<name>.<tld>.json`, `com-variants.tsv`, `com-owners.txt`, `whois.txt`
- npm: `npm view <name>` and the registry scope endpoint `https://registry.npmjs.org/-/org/<name>/package` (404 "Scope not found" = free) → `npm-gh.txt`, `npm-org.tsv`
- GitHub: `gh api users/<name>` → `npm-gh.txt`
- Stores: iTunes Search API → `appstore.txt`, `itunes-<name>.json`; Google Play search HTML → `play-<name>.html`
- Web conflicts: Firecrawl search (9 searches) → `fc-*.json`; Urban Dictionary API → `ud-<name>.json`
- Abu's existing names: `gh repo list Blockchain-Oracle`, `ls /Users/abu/dev/hackathon`
Verified: 2026-09-29

## How to read the availability results

- **RDAP 404 = no registration record → "likely available".** It is not a guarantee: the registry may list the name as premium, reserved, or priced above the standard fee. Nothing was bought or put on hold. 200 = registered.
- **Every bare `<word>.com` checked is registered** (19 of 19), most since the late 1990s. Short real Japanese words are almost all taken as .com. The realistic routes are .app/.ai/.xyz or a prefixed .com (`get…`, `use…`, `…app`); see §4.
- **npm scope:** the endpoint returns 200 for any existing user *or* org scope (sometimes with an empty package list `{}`), so 200 = scope taken. `npmjs.com/org/<name>` returned 403 to curl, so that check was not usable.
- **GitHub:** every short word except `kanegura` already exists as a user/org. Most are dormant (0 repos, registered 2010–2014). A dormant account is still not free; you would need GitHub's name-squatting process, which is not guaranteed. The fallback is `<name>-app` / `<name>hq`.
- **Urban Dictionary** returns fuzzy hits (mostly "a girl named X" posts) for nearly every word. Only real slang meanings are reported below.

## 1. Candidates (27) and meaning checks

All meanings are from JMdict via Jisho [VERIFIED]. "Why it fits" is [INFERENCE].

| # | Name | Kanji / kana | Literal meaning (JMdict) | Why it fits | Verdict |
|---|---|---|---|---|---|
| 1 | **Kawase** | 為替 かわせ | "money order; draft / exchange (e.g. foreign)" | Sending and exchanging money: send, swap and bridge in one word | **Keep** |
| 2 | **Kanegura** | 金蔵 かねぐら | "treasure house; treasury / financial supporter; patron; financier; backer" | Literally "treasury", the same idea as Tameion, plus "backer" | **Keep** |
| 3 | **Tayori** | 頼り / 便り たより | 頼り "reliance; dependence"; 便り "news; tidings; information; correspondence" | Two readings that fit: trust, and notifications | Keep. Note that 頼りない "unreliable" is a common compound; the name alone doesn't carry it |
| 4 | **Kurabito** | 蔵人 くらびと (dictionary readings くろうど/くらんど) | "keeper of imperial archives / worker skilled in the brewing of sake or soy sauce" | "Storehouse keeper", a steward | Keep, weaker: in modern web usage the word means sake brewer (fc-kurabito-app.json) |
| 5 | **Kaikei** | 会計 かいけい | "accounting; finance… / bill (at a restaurant) / accountant; treasurer; paymaster; cashier" | "Treasurer", a steward of money | Keep. Homophones: 海景 seascape, 海警 China Coast Guard (both harmless) |
| 6 | **Makase** | 任せ まかせ | "leaving everything up to someone else" (任せる "to entrust") | "Leave it to me": the agent promise | Keep; product conflict, §3 |
| 7 | **Mamori** | 守り まもり | "protection; defense… / amulet; charm; talisman" | Guardian of your money; the safety story | Keep; product conflict, §3 |
| 8 | **Kura** | 蔵 / 倉 くら | "warehouse; storehouse; cellar" | Storehouse, short | Keep for checks; 鞍 "saddle" and 暗い kurai "dark" are near-homophones |
| 9 | **Saifu** | 財布 さいふ | "wallet; purse; coin purse" | Literal wallet | Keep for checks |
| 10 | **Soroban** | 算盤 そろばん | "abacus / calculation (esp. of profit and loss)" | Reckoning, a ledger | Keep for checks |
| 11 | **Kakeibo** | 家計簿 かけいぼ | "household account book" | Budgeting ledger | Keep for checks |
| 12 | **Minori** | 実り みのり | "ripening (of a crop) / crop; harvest"; 実りある "fruitful" | Yield, earning | Keep for checks |
| 13 | **Nagare** | 流れ ながれ | "flow… stream; current / course (of events); procedure" | Money flow, automations | Keep for checks. 流れる also "to be washed away" (plan cancelled), a mild negative |
| 14 | **Anshin** | 安心 あんしん | "peace of mind; relief; (sense of) security; safety" | The trust feeling | Keep for checks |
| 15 | **Tomo** | 友 / 供 とも | "friend; companion" / "companion; follower; attendant" | Companion agent | Keep for checks |
| 16 | **Mikata** | 味方 みかた | "friend; ally; supporter" (homophone 見方 "viewpoint") | "On your side" | Checked; every domain registered (§2) |
| 17 | **Kanae** | 叶える かなえる (name form) / 鼎 かなえ | 叶える "to grant (a wish)… to make come true"; 鼎 "three-legged bronze vessel" | "Makes it happen" | Checked; every domain registered |
| 18 | **Tsukai** | 使い つかい | "errand; mission / messenger; bearer / familiar spirit" | Messenger that runs errands | Checked. 使い捨て tsukaisute "disposable" is a common compound; `ts` is hard for EN/FR/ES speakers |
| 19 | Kakehashi | 懸け橋 かけはし | "temporary (suspension) bridge / bridge (between cultures…); go-between; intermediary" | Bridging | Checked; every domain registered. 4 syllables, hard to spell |
| 20 | Kinko | 金庫 きんこ | "safe; strongbox… treasury" | Vault | **Discard**: the homophone 禁錮 means "imprisonment", and Kinko's is a known US brand name |
| 21 | Zeni | 銭 ぜに | "round coin with a (square) hole… / money" | Money | **Discard** [INFERENCE]: blunt "cash/coin"; 是認 zenin "approval" is fine, but the tone is low-trust |
| 22 | Tsuna | 綱 つな | "rope; cord; line" | Link | **Discard**: ツナ "tuna" is the same sound (JMdict) |
| 23 | Hashi | 橋 はし | "bridge" | Bridge | **Discard**: equally common homophones 箸 "chopsticks" and 端 "edge; odds and ends" |
| 24 | Takara | 宝 たから | "treasure"; 宝くじ "lottery" | Treasure | **Discard** [INFERENCE]: the lottery association and the Takara Tomy toy brand |
| 25 | Hibiki | 響き ひびき | "echo; reverberation / sound…" | Voice-first | **Discard**: weak money fit, and a famous Suntory whisky brand [INFERENCE: brand knowledge, not searched] |
| 26 | Hikyaku | 飛脚 ひきゃく | "express messenger; postman; courier" | Messenger | **Discard** [INFERENCE]: sounds like "hiccup" in English |
| 27 | Tawara | 俵 たわら | "straw bag; sack; bale" (rice bale) | Store of value | **Discard**: weak, and the related entry 俵責め is an Edo-period torture |

Also looked up and dropped for weak fit: Kotoba (言葉, language), Michi (道 road, but also 未知 "unknown"), Akari (明かり light), Musubi (結び knot/union; heavily used), Kizuna (絆 bond; heavily used), Tsumugi (紬 cloth), Orihime (織姫 Vega), Chokin (貯金 savings; "cho-kin" sounds awkward in English), Okane (お金, just "money"), Omakase (お任せ; a common restaurant term), Kanemori (JMdict has only a personal name), Choubo (帳簿 ledger; homophone 徴募 "enlistment"). **Yui** could not be verified: the romaji search returned 唯一/遺言 ("will; testament"), so it was dropped as unverified.

## 2. Availability checks (raw results)

Legend: ✅ RDAP 404 (likely available) · ❌ registered · npm pkg ✅ = E404 · scope ✅ = "Scope not found" · GH ✅ = 404.

| Name | .com | .app | .xyz | .ai | npm pkg | npm @scope | GitHub | App Store / Play (exact-name apps) |
|---|---|---|---|---|---|---|---|---|
| **Kawase** | ❌ (1999, Key-Systems; no page title) | ✅ | ❌ | ✅ | ✅ | ❌ (user scope, pkg `covid19-ja`) | ❌ user, 4 repos | None on the App Store; Play has `co.sokuhou.kawase` (Japanese FX-rate app) |
| **Kanegura** | ❌ (2015, Onamae.com; likely the Kyoto izakaya "KANEGURA") | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ **free** | None found |
| **Kurabito** | ❌ (2016, NameBright) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ user, 20 repos | None found |
| **Tayori** | ❌ Tayori (タヨリ) customer-support SaaS | ❌ | ✅ | ❌ | ❌ (React data-fetching lib, updated 2026-07) | ❌ (@tayori/core, /hono, …) | ❌ | "Tayori タヨリ" (YouTeacher) |
| **Kaikei** | ❌ (1998; expires 2026-11-09) | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ dormant (0 repos) | "Kaikei – Freelance Accounting", "KaiKei – Ultra-simple budget" (Finance) |
| **Makase** | ❌ Makase (AI concierge / law-firm software) | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ dormant | None on the App Store |
| **Tsukai** | ❌ (403 page) | ✅ | ✅ | ❌ | ❌ ("AgentRun lifecycle… SDK", an AI-agent SDK) | ✅ | ❌ user, 9 repos | n/a |
| **Mamori** | ❌ | ❌ | ❌ | ❌ (MAMORI.ai, Web3 risk platform) | ✅ | ❌ | ❌ dormant | 5+ apps named Mamori |
| **Kura** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ user, 91 repos | "Kura: Modern USD Finance" (Finance) |
| **Saifu** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ dormant | "Cosmetic Saifu" |
| **Soroban** | ❌ (Tomoe abacus maker) | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ dormant | 14 abacus apps |
| **Kakeibo** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ (created 2026-02) | 14 budgeting apps |
| Minori | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | "Minori" shift/pay app (Finance, JP) |
| Nagare | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (@nagare/core) | ❌ | 5 apps |
| Anshin | ❌ | ❌ | ❌ | ❌ | ❌ (React hooks) | ❌ | ❌ | 6 apps |
| Tomo | ❌ (Tomo Mortgage) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | "Tomo.inc" crypto wallet + 13 others |
| Mikata | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ org | "Mikata（ミカタ）" |
| Kanae | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | none exact |
| Kakehashi | ❌ | ❌ | ❌ | ❌ | ✅ (unpublished 2026-09-04) | ❌ | ❌ | n/a |

Notes on the checks:
- The four RDAP 404s from rdap.org (kawase.app, kawase.ai, tayori.xyz, makase.xyz) were re-checked against the registry RDAP servers and matched. `whois` for .xyz returned "DOMAIN NOT FOUND" for tayori.xyz and makase.xyz; whois for kawase.ai returned "Domain not found"; whois for kawase.app printed only the IANA TLD record, so it is **ambiguous** (registry RDAP says 404).
- rdap.org rate-limited later lookups (HTTP 429); those were redone directly against the registry servers (`rdap-direct.tsv`). The npm scope endpoint also rate-limited (Cloudflare 1015); scopes for tomo, mikata, kanae, tsukai and kanegura were retried successfully.
- Play Store search results are fuzzy and not ranked in the saved HTML. "None found" means no package id containing the name, which is weaker than a real conflict check.

## 3. Conflicts with existing crypto/fintech products

| Name | Conflict | Source | Severity [INFERENCE] |
|---|---|---|---|
| Kura | "Kura: Modern USD Finance", a live App Store fintech: "global payments, self-custody…"; kura-finance.com; also a Harvard iLab venture "Kura" moving money to emerging markets | appstore.txt; fc-kura-finance-usd-app.json [REPORTED] | **Fatal**: same category |
| Saifu | Saifu Wallet (Solana extensible wallet, saifuwallet.com); SFU token on Binance; "Trust Saifu" wallet on Play | fc-saifu-wallet-crypto.json [REPORTED] | **Fatal** |
| Soroban | Stellar's smart-contract platform ("Soroban is the smart contracts platform on the Stellar network") | stellar-soroban.html [VERIFIED] | **Fatal** in crypto |
| Mamori | MAMORI.ai (OneDegree), an AI Web3 risk-intelligence platform; mamori.io (security) | fc-mamori-ai-wallet.json [REPORTED] | **High**: same space |
| Tomo | Tomo.inc, a multichain social crypto wallet (App Store + Chrome) | fc-tomo-wallet-crypto.json, appstore.txt [REPORTED] | **Fatal** |
| Makase | Makase: an "AI concierge for home services" and AI software for law firms (makase.com) | fc-makase-app.json, com-owners.txt [REPORTED] | Medium: an AI-agent brand in another vertical |
| Tayori | Tayori (タヨリ), a Japanese customer-support SaaS on tayori.com; `tayori` npm package | com-owners.txt, npm-gh.txt [REPORTED] | Medium: different vertical, but it owns every good handle |
| Tsukai | `tsukai` npm package is an AI-agent SDK | npm-gh.txt [VERIFIED] | Medium |
| Kawase | No crypto/fintech product found. Hits: Kawase Computer Supplies (TSE delisting, May 2026), academic authors, a JP FX-rate Android app. Common Japanese surname | fc-kawase-crypto.json [REPORTED] | Low |
| Kanegura | Only a Kyoto wagyu izakaya "KANEGURA" | fc-kanegura.json [REPORTED] | Low |
| Kurabito | "Kurabito Stay" sake-brewery tourism; glossary term for sake brewers | fc-kurabito-app.json [REPORTED] | Low conflict, but it shifts the meaning |
| Kaikei | Small budgeting apps named Kaikei on both stores | appstore.txt, play-kaikei.html | Low–medium |

**Abu's existing names** (Blockchain-Oracle repos: shijima, agari, mitoshi, akashi, masayume, yosuku, keeperhub…): none of the candidates duplicates or closely resembles them [VERIFIED by repo list]. Relevant: Abu already has a repo called `arc-treasury-intelligence`, so a "treasury" meaning (Kanegura) overlaps in concept, not in name. Kura/Kurabito share 蔵 with nothing of Abu's. None of them echoes "keeper" in keeperhub, except Kurabito's "keeper of archives" gloss, which is in meaning only.

## 4. Shortlist: top 5 [INFERENCE]

| Rank | Name | Meaning | .com | .app | .xyz | .ai | npm pkg | npm @scope | GitHub |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Kawase** 為替 | money order; remittance; (currency) exchange | ❌ (getkawase / usekawase / kawaseapp / heykawase .com ✅) | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| 2 | **Kanegura** 金蔵 | treasure house; treasury; financier/backer | ❌ (getkanegura / usekanegura / kaneguraapp .com ✅) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | **Tayori** 頼り/便り | reliance + news/tidings | ❌ (gettayori.com ✅) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 4 | **Kurabito** 蔵人 | storehouse keeper; archive keeper (modern: sake brewer) | ❌ (kurabitoapp.com ✅) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 5 | **Kaikei** 会計 | accounting; treasurer; the bill | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ (dormant) |

**Recommendation [INFERENCE]: Kawase**, with **Kanegura** as the runner-up.
- **Kawase** says what the app *does*: moving and exchanging money, which covers send, swap and bridge. It is 3 open syllables that EN/FR/ES speakers read correctly from the spelling. It has no crypto/fintech conflict found, it matches Abu's short-Japanese-word style (Shijima, Agari), and `kawase.app` + `kawase.ai` + the npm package are open. The costs: no bare .com, and the GitHub user and npm scope are taken, so use `kawase-app` / `@kawase-app` or `kawasehq`. For Japanese speakers the word leans toward FX and bank transfers, which fits a stablecoin app. It is also a common surname (for example film director Naomi Kawase), which is neutral.
- **Kanegura** is the only candidate that is **completely open outside .com** (.app, .xyz, .ai, npm package, npm scope, GitHub). Its meaning is literally "treasury", which echoes the hackathon name Tameion; that is a nice story for judges. The costs: 4 syllables, `kane` = "money" is a little blunt, the .com is held by a Japanese registrant (likely the Kyoto izakaya), and it overlaps conceptually with Abu's `arc-treasury-intelligence`.
- **Tayori** has the best emotional meaning (trust + notifications), but an established Japanese SaaS holds the .com, .app, .ai, npm package and scope. Use it only as a feature name (e.g. for notifications).
- **Kurabito**: availability is good, but the meaning most people will find online is "sake brewery worker".
- **Kaikei**: strong meaning, but no open domains and small same-named finance apps on the stores.

Before committing, check trademarks (USPTO/EUIPO/J-PlatPat were **not** searched) and look at premium pricing at a registrar for kawase.app/.ai and kanegura.app/.ai. RDAP cannot show price.

## 5. Pronunciation guide

Japanese syllables are even and unstressed. Every vowel is pronounced: a = "ah", e = "eh", i = "ee", o = "oh", u = "oo". A final "e" is never silent.

| Name | Syllables | Say it like | IPA (approx.) | Pitfalls |
|---|---|---|---|---|
| Kawase | ka·wa·se | "kah-wah-seh" | /ka.wa.se/ | English speakers may say "ka-WAYS"; the final "e" is spoken. French: "ka-oua-zé" is close enough; Spanish reads it correctly as written |
| Kanegura | ka·ne·gu·ra | "kah-neh-goo-rah" | /ka.ne.ɡɯ.ɾa/ | English may say "cane-gura"; the "r" is a light tap, like Spanish "pero" |
| Tayori | ta·yo·ri | "tah-yoh-ree" | /ta.jo.ɾi/ | Easy in all three languages |
| Kurabito | ku·ra·bi·to | "koo-rah-bee-toh" | /kɯ.ɾa.bi.to/ | Easy; four beats |
| Kaikei | kai·kei | "kye-kay" | /kai.keː/ | "ei" is a long "eh" ("kay"), not "kee" |

## Gaps

- No trademark search (USPTO, EUIPO, J-PlatPat).
- No registrar price or premium check. RDAP 404 ≠ purchasable at the standard price.
- Play Store checks are weak (fuzzy search HTML).
- Slang checks cover Urban Dictionary plus reasoning for FR/ES. No native French or Spanish speaker reviewed the names.
- Hibiki and Takara were discarded on brand knowledge that was not searched this session.
