"""Check evidence integrity and guide links. Optional streaming source-hash verification."""
import argparse
import hashlib
import json
import re
import subprocess
from PIL import Image
from extract import ROOT, SOURCES

def verify(sources=False):
    screens=json.loads((ROOT/'screen-index.json').read_text())
    motions=json.loads((ROOT/'motion-index.json').read_text())
    ledger=json.loads((ROOT/'reference-ledger.json').read_text())
    identities=json.loads((ROOT/'asset-identity-register.json').read_text())['entries']
    features=json.loads((ROOT/'feature-inventory.json').read_text())['features']
    assert len(screens)==97 and len(motions)==18 and len(ledger['components'])==44
    ids={s['id'] for s in screens}|{m['id'] for m in motions}
    assert len(ids)==115
    links=0
    for path in ROOT.glob('*.md'):
        for target in re.findall(r'\]\(([^)]+)\)',path.read_text()):
            if re.match(r'^(https?:|#)',target):continue
            target=target.strip('<>').split('#')[0]
            assert (path.parent/target).exists(),f'{path.name}: missing {target}'
            links+=1
    for s in screens:
        with Image.open(ROOT/s['image']) as im:assert im.size==(804,1748),(s['id'],im.size)
    duration_checks=[]
    for m in motions:
        assert (ROOT/m['strip']).exists()
        metadata=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(ROOT/m['video'])],text=True))
        vs=next(s for s in metadata['streams'] if s['codec_type']=='video')
        assert (vs['width'],vs['height'])==(402,874)
        assert not any(s['codec_type']=='audio' for s in metadata['streams'])
        actual=float(metadata['format']['duration'])
        assert abs(actual-m['duration_seconds'])<.12,(m['id'],actual)
        duration_checks.append({'id':m['id'],'encoded_seconds':actual,'requested_seconds':m['duration_seconds']})
    for c in ledger['components']:
        assert c['evidence_ids'] and set(c['evidence_ids'])<=ids,c['id']
    for collection in [identities,features]:
        assert len({e['id'] for e in collection})==len(collection)
        for e in collection:
            assert e['evidence_ids'] and set(e['evidence_ids'])<=ids,e['id']
    assert ledger['identities']==identities and ledger['features']==features
    assert len(identities)==38 and len(features)==116
    for e in identities:
        if 'evidence_crop' not in e:continue
        crop=e['evidence_crop'];assert crop['screen_id'] in e['evidence_ids']
        left,top,right,bottom=crop['box_804px']
        assert 0<=left<right<=804 and 0<=top<bottom<=1748,e['id']
    hash_checks=[]
    for key,source in SOURCES.items():
        meta=json.loads((ROOT/'evidence'/key/'metadata.json').read_text())
        if sources:
            digest=hashlib.sha256()
            with source.open('rb') as file:
                for block in iter(lambda:file.read(8*1024*1024),b''):digest.update(block)
            assert digest.hexdigest()==meta['sha256'],key
        hash_checks.append({'recording':key,'hash_verified':sources})
    result={'screen_count':len(screens),'motion_count':len(motions),'component_count':len(ledger['components']),
      'markdown_local_links_checked':links,'media_dimensions_and_durations':'passed',
      'component_evidence_references':'passed','source_hashes':hash_checks,'motion_durations':duration_checks}
    result.update({'identity_count':len(identities),'feature_count':len(features),
      'identity_and_feature_evidence_references':'passed','ledger_register_consistency':'passed','identity_crop_bounds':'passed'})
    (ROOT/'validation.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({k:v for k,v in result.items() if k!='motion_durations'}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sources',action='store_true');args=p.parse_args()
    verify(args.sources)
