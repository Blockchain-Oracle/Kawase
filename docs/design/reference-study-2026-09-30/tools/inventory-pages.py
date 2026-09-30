"""Render human-readable inventory tables from the two canonical JSON registers."""
import json
from itertools import groupby
from extract import ROOT

def link(sid,screens):
    s=screens[sid]
    return f"[{sid} · {s['time_seconds']}s]({s['image']})"

def render():
    screens={s['id']:s for s in json.loads((ROOT/'screen-index.json').read_text())}
    motions={m['id']:m for m in json.loads((ROOT/'motion-index.json').read_text())}
    def evidence(ids):
        return ', '.join(link(i,screens) if i in screens else f"[{i}]({motions[i]['video']})" for i in ids)
    def safe(text):return text.replace('|',' / ').replace('\n',' ')
    identities=json.loads((ROOT/'asset-identity-register.json').read_text())['entries']
    table=['| ID / identity | Role | Visible treatment | Evidence |','|---|---|---|---|']
    for e in identities:
        table.append(f"| {e['id']} {e['name']} | {e['identity_kind']} | {safe(e['observed_rendering'])}; {safe(e['semantic_role'])} | {evidence(e['evidence_ids'])} |")
    path=ROOT/'08-logos-and-identity.md'
    source=path.read_text();marker='<!-- IDENTITY_TABLE -->'
    path.write_text(source.split(marker)[0]+marker+'\n\n'+'\n'.join(table)+'\n')
    features=json.loads((ROOT/'feature-inventory.json').read_text())['features']
    parts=[INTRO.replace('__COUNT__',str(len(features)))]
    for (app,group),entries in groupby(features,key=lambda e:(e['app'],e['group'])):
        parts += [f'## {app} — {group}', '', '| Feature | Capture and evidence | Visible behavior | Boundary / target treatment |', '|---|---|---|---|']
        for e in entries:
            parts.append(f"| {e['id']} **{e['feature']}** | {e['capture_status']}. {evidence(e['evidence_ids'])} | {safe(e['observed_behavior'])} | {safe(e['unverified_boundary'])} **{e['senryo_treatment']}**. |")
        parts.append('')
    parts += [OUTRO]
    (ROOT/'09-feature-inventory.md').write_text('\n'.join(parts))
    print(f'Rendered {len(identities)} identity entries and {len(features)} feature entries')

INTRO='''# Feature inventory — what each recording actually contains

> **Reuse context:** This guide preserves the original Senryo example. Its D2/product decisions and existing-plan labels are historical, not rules for another app. Start with the [project handoff](PROJECT-HANDOFF.md).


[Study index](README.md) · [Logos and identity](08-logos-and-identity.md) · [Redesign opportunities](10-redesign-opportunities.md) · [Machine-readable feature inventory](feature-inventory.json)

This register contains **__COUNT__ feature and behavior entries**, including the requested password/passkey topics as explicit gaps. It inventories everything identified in these recorded sessions; it cannot claim every feature in the full apps. UI cards, actual payment cards, marketing illustrations and functioning product features are distinguished.

**Capture status:** Observed behavior = an action/state transition is visible; Visible affordance = control/content exists but its result is not demonstrated; Advertised or illustrated = benefit or tutorial content; Started/outcome incomplete = entered flow stops before completion; Not captured = no direct ceremony/outcome exists in these recordings.

**Target treatment:** Existing-plan journey means the interaction/presentation can enrich an already specified Senryo journey, not that the competitor's whole product feature or current implementation is present. Candidate product addition means an idea for a product decision. Product decision required means support, integration or scope cannot be inherited. Reference-specific means policy, limits or claims belong to the recorded app. These labels do not claim implementation or live acceptance.

## Senryo boundaries checked before proposing add-ons

The [current product plan](../../plan/00-plan.md) already specifies passkey account creation/returning sign-in, biometrics, trading/leverage/risk, trigger SL/TP, watchlists, alerts, deposits/withdrawals, card flows, recovery and execution status. Treat better visual/interaction handling as **polish of planned journeys**, not newly invented features.

D-041 specifies Mera signing, external funding by QR/address, a separate Monad deposit family and **no fiat on-ramp at launch**. Apple/Google account login, wallet connectors, Apple Pay purchases, debit on-ramps and every competitor chain are not silently added. D-029 defines passkey create/returning behavior. D-037 refines the earlier Face ID defaults by mode/threshold; do not implement a stale earlier default. Senryo's planned 500 ms hold confirmation remains authoritative rather than adopting Fomo's unproven slider success.

Usernames, social follows, clans, trader feeds, referral mechanics and prediction markets are **candidate product changes** here. They need full happy/failure/empty/loading/recovery journeys and actual data before they can become capabilities. Advertising a card/yield/reward benefit is not proof of issuance, spending, staking or payout.
'''

OUTRO='''## Coverage checks for an implementing agent

Pick an end-to-end journey and all its feature IDs before choosing components. Map those IDs to the [44 component briefs](05-components-and-agent-handoff.md), identity requirements and motion IDs. A feature that depends on another route must carry its parent restoration, field retention, consent, keyboard, data-loading and error states with it.

The recording proves a selected set of interface behavior. A complete target journey still needs actual creation/sign-in, successful funds credit, validated order/settlement, completed SL/TP, position management, card lifecycle and secure recovery. Use [capture gaps](06-capture-gaps.md) to separate missing reference fidelity from target product acceptance. Never fabricate a successful receipt from the recorded zero-balance screens.

The reference interfaces have imperfections too: unresolved logos, stale profile identity, deposit/dock overlap and long provider waits. Improve these as declared adaptations. Preserve the intended information and journey, not the accidental defect.
'''

if __name__=='__main__':render()
