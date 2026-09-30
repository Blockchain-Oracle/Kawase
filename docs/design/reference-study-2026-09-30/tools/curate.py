"""Create the retained, locally redacted evidence and machine-readable screen index."""
import concurrent.futures
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont
from extract import ROOT, CACHE, SOURCES, sheet

# Times are source-relative seconds. These are evidence anchors, not claimed tap times.
SCREENS = [
    ('S01','R1',18,'All-in-one onboarding','onboarding,3D,cards'),
    ('S02','R1',22,'Safe by default panel','onboarding,security,3D'),
    ('S03','R1',25,'Trade anything panel','onboarding,assets,3D'),
    ('S04','R1',27,'Earn yield panel','onboarding,3D,cards'),
    ('S05','R1',29,'Spend crypto panel','onboarding,3D,cards'),
    ('S06','R1',31,'Ownership panel','onboarding,NFT,3D'),
    ('S07','R1',35,'Import wallet methods','sheet,authentication'),
    ('S08','R1',39,'Create wallet methods','sheet,authentication'),
    ('S09','R1',54,'Create six-digit passcode','security,keypad'),
    ('S10','R1',56,'Confirm passcode','security,keypad'),
    ('S11','R1',58,'Biometric education','security,animation'),
    ('S12','R1',60,'Native Face ID permission','security,system'),
    ('S13','R1',63,'Completion flag','onboarding,3D,animation'),
    ('S14','R1',64.5,'Notification education','onboarding,permissions'),
    ('S15','R1',66,'Empty portfolio','empty,cards,navigation'),
    ('S16','R1',70,'Cards first-use tutorial','tutorial,3D,cards'),
    ('S17','R1',71.5,'Settings tutorial illustration','tutorial,menu'),
    ('S18','R1',72.5,'Cards coming-soon surface','3D,cards'),
    ('S19','R1',76,'Explore feed and browser bar','discovery,cards'),
    ('S20','R1',81,'Markets and empty watchlist','markets,empty,cards'),
    ('S21','R1',88,'Receive QR','receive,QR,animation'),
    ('S22','R1',92,'Bridge education','funding,education'),
    ('S23','R1',94,'Bridge configuration loading','funding,loading'),
    ('S24','R1',97,'Bridge chain chooser','funding,sheet'),
    ('S25','R1',98,'Bridge order error','funding,error'),
    ('S26','R1',100,'Bridge supported assets','funding,warning'),
    ('S27','R1',102,'Bridge receive asset chooser','funding,sheet,search'),
    ('S28','R1',106,'Buy crypto education','funding,3D'),
    ('S29','R1',112,'Onramper pending quote','funding,webview,loading'),
    ('S30','R1',115,'Onramper loaded quote','funding,webview'),
    ('P01','R2',2,'Animated welcome artwork','onboarding,illustration,animation'),
    ('P02','R2',5,'Recovery and hardware alternatives','authentication,navigation'),
    ('P03','R2',12,'Google account picker container','authentication,system'),
    ('P04','R2',26,'Provider return loading','authentication,webview,loading'),
    ('P05','R2',36,'Username input and keyboard','onboarding,validation,keyboard'),
    ('P06','R2',49,'X import requires login','onboarding,webview,error'),
    ('P07','R2',62,'Username length error','onboarding,validation'),
    ('P08','R2',68,'Username available','onboarding,validation'),
    ('P09','R2',72,'Optional referral','onboarding,form'),
    ('P10','R2',74.5,'Face ID education','security,3D'),
    ('P11','R2',79,'Notification permission','permissions,system'),
    ('P12','R2',83,'Testnet home and token error','home,error,testnet'),
    ('P13','R2',90,'Trade market discovery','markets,cards'),
    ('P14','R2',107.5,'Prediction market cards','prediction,cards'),
    ('P15','R2',115,'BTC prediction detail','prediction,sheet,chart'),
    ('P16','R2',121,'Prediction detail scrolled','prediction,sheet,chart'),
    ('P17','R2',124,'Insider trading attestation','prediction,sheet,eligibility'),
    ('P18','R2',129,'Buy Up ticket loading','prediction,keypad,loading'),
    ('P19','R2',138,'Blurred quick-action fan','menu,blur,animation'),
    ('P20','R2',145,'Trade amount ticket','trade,keypad,sheet'),
    ('P21','R2',150,'Solana Devnet receive QR','receive,QR,sheet,testnet'),
    ('P22','R2',156,'Send empty state','send,empty,search'),
    ('F01','R3',4,'3D welcome characters','onboarding,3D,illustration'),
    ('F02','R3',10,'Google to privy.io container','authentication,system'),
    ('F03','R3',22,'Google login pending','authentication,loading'),
    ('F04','R3',32,'Username field and generated handle','onboarding,form'),
    ('F05','R3',36,'Username minimum length error','onboarding,validation'),
    ('F06','R3',44,'Follow top traders','onboarding,social,cards'),
    ('F07','R3',47,'Referral input','onboarding,form,keyboard'),
    ('F08','R3',50,'Terms checkbox gate','onboarding,sheet,eligibility'),
    ('F09','R3',57,'Home balance and Hall of Fame','home,cards'),
    ('F10','R3',64,'Token categories and rows','markets,filters'),
    ('F11','R3',68,'Perps introduction and categories','markets,perps'),
    ('F12','R3',70,'Collapsed header and glass dock','navigation,scroll,glass'),
    ('F13','R3',81,'Hall of Fame position detail','social,sheet,chart'),
    ('F14','R3',88,'Position thesis and transactions','social,sheet,cards'),
    ('F15','R3',99,'Global trade feed','social,feed,cards'),
    ('F16','R3',105,'Profile overview','profile,empty,cards'),
    ('F17','R3',109,'Profile edit form','profile,form'),
    ('F18','R3',110,'Profile account controls','profile,form,security'),
    ('F19','R3',114,'Apple Pay promo and deposit CTA','profile,funding,cards'),
    ('F20','R3',119,'Deposit method sheet','funding,sheet'),
    ('F21','R3',124,'Crypto network chooser','funding,sheet'),
    ('F22','R3',129,'Apple Pay token picker','funding,sheet,search'),
    ('F23','R3',145,'Cash amount ticket','funding,keypad'),
    ('F24','R3',147,'Below-minimum cash amount','funding,keypad,validation'),
    ('F25','R3',150,'Cash amount pending verification','funding,loading'),
    ('F26','R3',154,'Identity verification loading','funding,webview,loading'),
    ('F27','R3',156.8,'Cash amount retained after return','funding,form'),
    ('F28','R3',161,'Exchanges and apps chooser','funding,sheet'),
    ('F29','R3',171,'Leaderboard and clans','social,leaderboard,cards'),
    ('F30','R3',176,'Friends ranking and recommendations','social,leaderboard'),
    ('F31','R3',186,'Global search empty state','search,empty,navigation'),
    ('F32','R3',191.5,'ZEC candlestick market detail','trade,chart'),
    ('F33','R3',194,'Market holders tab','trade,social'),
    ('F34','R3',196,'Market feed tab','trade,social,loading'),
    ('F35','R3',200,'Market About tab','trade,chart'),
    ('F36','R3',203,'Perps eligibility gate','trade,sheet,eligibility'),
    ('F37','R3',206,'Zero-amount order ticket','trade,keypad'),
    ('F38','R3',210,'Leverage ruler','trade,animation'),
    ('F39','R3',220,'Embedded chart ticket mode','trade,chart'),
    ('F40','R3',224.8,'Embedded chart style dialog','trade,chart,settings'),
    ('F41','R3',232,'Amount entered; insufficient funds','trade,keypad,error'),
    ('F42','R3',236,'Leveraged size distinct from margin','trade,keypad'),
    ('F43','R3',238.5,'Liquidation price explanation','trade,sheet,education'),
    ('F44','R3',241,'Stop loss and take profit sheet','trade,sheet,form'),
    ('F45','R3',242,'Risk fields with native keyboard','trade,keyboard,form'),
]

def redact(im, key, t):
    """Conservative layout masks, based on inspection of these specific recordings."""
    w,h = im.size
    draw=ImageDraw.Draw(im)
    boxes=[]
    if key=='R1' and (t<7 or 41.5<=t<=46.8):
        boxes.append((0,.07,1,.97,'Outside-app content omitted'))
    if key=='R2' and 8<=t<=19.9:
        boxes.append((0,.34,1,.89,'Personal Google account details omitted'))
    if key=='R3' and 7<=t<=18.8:
        boxes.append((0,.15 if t>=14 else .38,1,.90,'Personal Google account details omitted'))
    if key=='R3' and 107<=t<=111.4:
        # Connected email row scrolls upward. Preserve other controls where possible.
        boxes.append((.095,.70,1,.75,'Connected account omitted') if t<109.6
                     else (.095,.55,1,.605,'Connected account omitted'))
    for x1,y1,x2,y2,label in boxes:
        rect=(round(w*x1),round(h*y1),round(w*x2),round(h*y2))
        draw.rectangle(rect,fill='#151620')
        font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',max(11,round(w/34)))
        draw.text((rect[0]+10,rect[1]+8),label,fill='#c3c5d0',font=font)
    return im, bool(boxes)

def frame(item):
    sid,key,t,title,tags=item
    dest=ROOT/'evidence'/key/'screens'
    dest.mkdir(parents=True,exist_ok=True)
    path=dest/f'{sid}.jpg'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(t),'-i',str(SOURCES[key]),'-frames:v','1','-vf','scale=804:-1','-q:v','2',str(path)],check=True)
    im,redacted=redact(Image.open(path).convert('RGB'),key,t)
    im.save(path,quality=91)
    return {'id':sid,'recording':key,'time_seconds':t,'title':title,'tags':tags.split(','),'image':f'evidence/{key}/screens/{sid}.jpg','redacted':redacted,'confidence':'observed','time_precision':'Approximate source-relative evidence anchor; not an exact tap timestamp.'}

def overviews():
    for key in SOURCES:
        dest=CACHE/key/'sanitized-overview'
        dest.mkdir(parents=True,exist_ok=True)
        files=sorted((CACHE/key/'samples').glob('*.jpg'))
        selected=[]
        for i,path in enumerate(files):
            if i%8: continue
            t=i*.5
            im,_=redact(Image.open(path).convert('RGB'),key,t)
            out=dest/path.name
            im.save(out,quality=90)
            selected.append((t,out))
        for offset in range(0,len(selected),16):
            items=selected[offset:offset+16]
            sheet([p for t,p in items],[t for t,p in items],ROOT/'evidence'/key/f'overview-{offset//16+1:02d}.jpg',f'{key} | 4-second overview | personal accounts obscured')

if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results=list(pool.map(frame,SCREENS))
    (ROOT/'screen-index.json').write_text(json.dumps(results,indent=2))
    overviews()
    print(f'Created {len(results)} curated frames and sanitized overview sheets')
