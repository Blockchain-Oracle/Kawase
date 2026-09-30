"""Build the local evidence browser and structured fidelity ledger. No network calls."""
import html
import json
import re
import subprocess
from pathlib import Path
from extract import ROOT

APPS={'R1':'Solflare','R2':'Phantom','R3':'Fomo'}
GUIDES={'R1':'01-solflare.md','R2':'02-phantom.md','R3':'03-fomo.md'}

GAPS=[
 ('G01','Passkey creation and later sign-in','Blocked','No passkey ceremony is shown; Face ID is not sufficient evidence.'),
 ('G02','Text-password setup and recovery','Blocked','Only numeric passcode setup/confirmation is recorded.'),
 ('G03','Successful funding and receipt','Blocked','No credited deposit, successful KYC or Apple Pay authorization is captured.'),
 ('G04','Enabled order confirmation and completed position','Blocked','Tickets remain zero-amount or insufficient-funds; successful slider gesture unknown.'),
 ('G05','Recovery phrase / private key / Shield / hardware','Blocked','Alternative method affordances are visible; entered branches are not.'),
 ('G06','Denied permissions and interrupted auth recovery','Blocked','Failure/cancel recovery is not established.'),
 ('G07','Saved stop loss / take profit','Blocked','Focus/keyboard shown; no completed save, validation or later edit.'),
 ('G08','Actual settings / account management / key export','Blocked','Tutorial illustration and profile affordances do not prove completed utility flows.'),
 ('G09','Recipient search / send review / send completion','Blocked','Send shows loading then no-recents state only.'),
 ('G10','Copy / share / favorite results','Blocked','Controls visible; their results are not captured.'),
 ('G11','Social interaction / search results / clan detail','Blocked','Surfaces visible; end-to-end interaction branches incomplete.'),
 ('G12','Dismiss gestures and exact spring/blur/easing','Blocked','Visible travel is recorded; thresholds and source parameters unknown.'),
 ('G13','Audio / haptics / source asset formats','Blocked','Audio effectively silent; no asset files, rigs or source runtime supplied.'),
 ('X01','iPhone launch/search and Telegram detour','Excluded','Outside-app content is not Solflare product navigation.'),
 ('X02','External shijima.xyz detour','Excluded','Trigger/destination relationship uncertain; not canonical Fomo funding content.'),
 ('X03','Stale profile identity and deposit/dock collision','Excluded','Record as observed imperfections; do not require ideal reconstruction to repeat them.'),
 ('A01','Reduced-motion alternatives','Additive','Recommended target accessibility behavior, not captured.'),
 ('A02','Keyboard/focus/screen-reader parity','Additive','Recommended acceptance work; source assistive behavior unobserved.'),
 ('A03','Wide-screen adaptation','Additive','Only portrait mobile aspect ratio supplied.'),
]

NOTES={
 'S07':'Import method selector only; no successful import.',
 'S08':'Create-method selection surface. Account internals not visible.',
 'S09':'Six-digit numeric passcode, masked; not a text password.',
 'S10':'Successful confirmation shown; mismatch/reset unknown.',
 'S12':'Native Face ID permission; does not establish a passkey.',
 'S17':'Settings menu is tutorial artwork, not an opened settings flow.',
 'S18':'Coming-soon card product; no issuance or spending.',
 'S21':'Copy/Share visible; outcomes unknown. Do not reuse recorded address.',
 'S24':'Recognizable chain marks, including recorded square Base variant. Not a target support list.',
 'S25':'Bridge creation fails; retry visible, successful order absent.',
 'S27':'Actual SOL/USDC/USDT marks alongside unresolved white token-image discs; exact image failure/loading cause unknown.',
 'S30':'Quote loads; purchase not submitted. Quote figures are recording examples.',
 'P03':'Google browser flow; personal details omitted.',
 'P06':'X login required; username import not completed.',
 'P07':'Observed username length rule is 2–20 characters; product-specific.',
 'P12':'Explicit Testnet Mode and token fetch error; Retry outcome unknown.',
 'P17':'Reference attestation wording, not target legal policy.',
 'P18':'Amount remains zero; balance/asset regions are loading.',
 'P19':'Strong blur and staggered fan entrance; final geometry is vertical, not radial.',
 'P21':'Explicit Solana Devnet. Copy/share and network chooser branches unrecorded.',
 'P22':'Recipient skeleton resolves to no-recents; no transfer.',
 'F02':'Visible Google destination privy.io; not full architecture proof.',
 'F05':'Observed minimum-four-character rule; target rule undecided.',
 'F07':'No-code path proceeds via I do not have one / Finish setup.',
 'F08':'Checkbox-dependent continuation; target policy must be separate.',
 'F12':'Glass-like appearance and scroll-driven header; native material API unknown.',
 'F16':'Loaded profile follows brief stale/skeleton identity; do not prescribe stale state.',
 'F18':'Email redacted. Key export affordance only; no key displayed.',
 'F19':'Deposit CTA overlaps dock in some frames; blue is underlying content, not established dock theme.',
 'F21':'Networks listed; no network chosen or receive QR produced.',
 'F22':'Actual token artwork with blue check badges, not chain logos; check policy unverified. No token purchase/Apple Pay authorization.',
 'F24':'Two-dollar amount displays five-dollar minimum; observed reference rule.',
 'F26':'Identity web content remains loading; verification not completed.',
 'F27':'Twenty-dollar input retained after leaving verification.',
 'F31':'Empty recent search; results not shown.',
 'F32':'ZEC asset logo, small Hyperliquid-like context mark, and 10x chip are distinct roles; exact venue/network model unknown.',
 'F36':'Reference eligibility checkbox; not target legal guidance.',
 'F38':'Centered leverage scale; exact snapping physics unknown.',
 'F40':'Embedded chart style dialog observed; vendor unknown.',
 'F41':'Ten-dollar margin at 1x, insufficient funds.',
 'F42':'Ten-dollar margin at 2x; leveraged size twenty dollars; trade direction uncertain.',
 'F43':'Liquidation explanation only; no event or verified risk formula.',
 'F45':'Native keyboard lifts risk child; save/validation not shown.',
}

def refs(text):
    ids=[]
    for m in re.finditer(r'([SPFM])(\d{2})(?:[–-](?:\1)?(\d{2}))?',text):
        prefix,start,end=m.groups()
        ids += [f'{prefix}{i:02d}' for i in range(int(start),int(end or start)+1)]
    return list(dict.fromkeys(ids))

def components():
    rows=[]
    for line in (ROOT/'05-components-and-agent-handoff.md').read_text().splitlines():
        if not re.match(r'^\| C\d{2} ',line): continue
        cells=[c.strip() for c in line.strip('|').split('|')]
        match=re.match(r'(C\d+) (.*)',cells[0])
        cid,name=match.groups()
        rows.append({'id':cid,'name':name,'observed_anatomy_and_states':cells[1],
          'evidence_ids':refs(cells[2]),'search_and_match_brief':cells[3],
          'confidence':'Observed visual/behavioral brief; underlying implementation unknown',
          'proposed_reference_treatment':'Adapted' if cid in ['C04','C06','C07','C12'] else 'Exact',
          'target_decision':'Pending user/design selection',
          'adaptation_boundary':'Brand, copy, assets, supported networks, business rules and platform surfaces require target-specific decisions.',
          'implementation_status':'Not implemented by this study'})
    return rows

def build():
    screens=json.loads((ROOT/'screen-index.json').read_text())
    motions=json.loads((ROOT/'motion-index.json').read_text())
    for s in screens:
        s['app']=APPS[s['recording']]
        s['guide']=GUIDES[s['recording']]
        s['note']=NOTES.get(s['id'],'Observed screen anchor. Use the app guide for its trigger, state and branch limits.')
    for m in motions:
        m['app']=APPS[m['recording']]
        m['guide']='04-motion-and-assets.md'
        m['tags']=['motion',m['title'].lower()]
        poster=ROOT/'evidence'/'motion'/f"{m['id']}-poster.jpg"
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(min(.8,m['duration_seconds']/2)),'-i',str(ROOT/m['video']),'-frames:v','1','-q:v','3',str(poster)],check=True)
        m['poster']=f"evidence/motion/{m['id']}-poster.jpg"
        frames=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(ROOT/m['video'])],text=True))
        m['frame_times']=[float(f['best_effort_timestamp_time']) for f in frames['frames'] if 'best_effort_timestamp_time' in f]
    comps=components()
    identities=json.loads((ROOT/'asset-identity-register.json').read_text())
    features=json.loads((ROOT/'feature-inventory.json').read_text())
    sources=[json.loads((ROOT/'evidence'/r/'metadata.json').read_text()) for r in APPS]
    ledger={'schema_version':2,'purpose':'Observed reference inventory and proposed fidelity treatments; no implementation claim.',
      'reference_authority':'Three user-supplied local recordings; source hashes in metadata.',
      'target_design_authority':'Destination current design/decisions; original Senryo D2 labels are historical example context.',
      'evidence_labels':['Observed','Inferred','Unknown / capture gap'],
      'treatment_labels':['Exact','Adapted','Additive','Blocked','Excluded'],
      'sources':[{'id':s['id'],'app':APPS[s['id']],'source':s['source'],'sha256':s['sha256'],'duration_seconds':s['duration_seconds']} for s in sources],
      'screens':[{**s,'proposed_reference_treatment':'Exact','implementation_status':'Not implemented'} for s in screens],
      'motions':[{k:v for k,v in m.items() if k!='frame_times'} for m in motions],
      'components':comps,
      'identity_requirement':identities['required_rule'],
      'identities':identities['entries'],
      'features':features['features'],
      'feature_target_status':features['senryo_status'],
      'redesign_opportunity_guide':'10-redesign-opportunities.md',
      'gaps_exclusions_and_additions':[{'id':i,'name':n,'treatment':t,'reason':why,'implementation_status':'Not implemented'} for i,n,t,why in GAPS]}
    if (ROOT/'PACKAGE-CONTEXT.json').exists():
        ledger['reuse_context']=json.loads((ROOT/'PACKAGE-CONTEXT.json').read_text())
    (ROOT/'reference-ledger.json').write_text(json.dumps(ledger,indent=2,ensure_ascii=False))
    data=json.dumps({'screens':screens,'motions':motions,'components':comps,'identities':identities['entries'],'features':features['features']},ensure_ascii=False).replace('<','\\u003c')
    template=(ROOT/'tools'/'gallery-template.html').read_text()
    (ROOT/'gallery.html').write_text(template.replace('__EVIDENCE_DATA__',data))
    print(f'Built gallery: {len(screens)} screens, {len(motions)} motions, {len(comps)} components')

if __name__=='__main__': build()
