"""Make an evidence board from registered logo crops. This does not create production assets."""
import json
import math
from PIL import Image, ImageDraw, ImageFont
from extract import ROOT

def build():
    register=json.loads((ROOT/'asset-identity-register.json').read_text())
    screens={s['id']:s for s in json.loads((ROOT/'screen-index.json').read_text())}
    entries=[e for e in register['entries'] if 'evidence_crop' in e]
    width,height,columns=240,215,5
    board=Image.new('RGB',(width*columns,height*math.ceil(len(entries)/columns)), '#15151b')
    draw=ImageDraw.Draw(board)
    font_path='/System/Library/Fonts/Supplemental/Arial.ttf'
    font=ImageFont.truetype(font_path,16)
    small=ImageFont.truetype(font_path,13)
    for i,e in enumerate(entries):
        x=(i%columns)*width;y=(i//columns)*height
        crop=e['evidence_crop'];s=screens[crop['screen_id']]
        with Image.open(ROOT/s['image']) as im:
            tile=im.crop(crop['box_804px'])
            tile.thumbnail((122,122))
            # Upscale only the inspection preview, never claim additional source detail.
            if max(tile.size)<95:
                scale=95/max(tile.size);tile=tile.resize((round(tile.width*scale),round(tile.height*scale)))
            board.paste(tile,(x+(width-tile.width)//2,y+12+(122-tile.height)//2))
        label=e['name']
        words=label.split();lines=[];line=''
        for word in words:
            trial=f'{line} {word}'.strip()
            if draw.textlength(trial,font=font)>width-24:
                lines.append(line);line=word
            else:line=trial
        lines.append(line)
        for j,line in enumerate(lines[:2]):draw.text((x+12,y+142+j*18),line,font=font,fill='#fafafa')
        draw.text((x+12,y+188),f"{e['id']} · {s['id']} · {s['time_seconds']}s",font=small,fill='#afb3be')
    out=ROOT/'evidence'/'identity-board.jpg'
    board.save(out,quality=94)
    print(f'{len(entries)} registered evidence crops → {out.name}')

if __name__=='__main__':build()
