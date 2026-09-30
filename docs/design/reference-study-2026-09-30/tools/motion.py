"""Extract short original-motion excerpts and timestamped inspection strips."""
import concurrent.futures
import json
import subprocess
from pathlib import Path
from extract import ROOT, SOURCES, sheet

JOBS = [
    ("M01", "R1", 20.5, 3.5, "Onboarding panel change"),
    ("M02", "R1", 33.0, 1.5, "Import sheet entrance"),
    ("M03", "R1", 69.0, 3.5, "Cards introduction and artwork"),
    ("M04", "R1", 85.5, 2.0, "Receive screen and QR assembly"),
    ("M05", "R2", 0.0, 7.0, "Welcome illustration loop"),
    ("M06", "R2", 136.0, 1.5, "Quick actions with background blur"),
    ("M07", "R2", 142.5, 2.0, "Quick actions into Trade"),
    ("M08", "R2", 110.0, 5.0, "Prediction detail sheet entrance"),
    ("M09", "R3", 67.0, 3.5, "Home scroll and collapsing header"),
    ("M10", "R3", 101.0, 4.0, "Floating navigation to profile"),
    ("M11", "R3", 107.0, 3.0, "Edit profile presentation"),
    ("M12", "R3", 115.0, 4.0, "Deposit method sheet entrance"),
    ("M13", "R3", 202.0, 3.0, "Eligibility gate into trade ticket"),
    ("M14", "R3", 208.0, 4.0, "Leverage ruler scrolling"),
    ("M15", "R3", 240.0, 3.5, "Stop loss sheet and keyboard"),
    ("M16", "R3", 121.5, 4.0, "Nested deposit chain chooser"),
    ("M17", "R3", 0.8, 5.0, "Login artwork and 3D characters"),
    ("M18", "R1", 62.4, 1.4, "Animated completion flag"),
]

def extract_job(job):
    mid, key, start, duration, title = job
    dest=ROOT/"evidence"/"motion"
    dest.mkdir(parents=True,exist_ok=True)
    scratch=Path('/tmp/metropolis-reference-inspection')/mid
    scratch.mkdir(parents=True,exist_ok=True)
    filters = "scale=402:-1"
    if mid == "M11":
        # Connected email moves while scrolling. Obscure its entire swept band.
        filters += ",drawbox=x=0:y=450:w=402:h=230:color=0x12131a:t=fill"
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-ss",str(start),"-i",str(SOURCES[key]),"-t",str(duration),"-an","-vf",filters,"-fps_mode","vfr","-c:v","libx264","-preset","fast","-crf","22","-pix_fmt","yuv420p","-movflags","+faststart",str(dest/f"{mid}.mp4")],check=True)
    # Eight samples per second for inspection. Videos are rescaled, silent excerpts.
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-ss",str(start),"-i",str(SOURCES[key]),"-t",str(duration),"-vf","fps=8,scale=402:-1","-q:v","3",str(scratch/"%04d.jpg")],check=True)
    files=sorted(scratch.glob('*.jpg'))
    if mid == "M11":
        from PIL import Image, ImageDraw
        for file in files:
            im = Image.open(file).convert("RGB")
            ImageDraw.Draw(im).rectangle((0,450,402,680),fill="#12131a")
            im.save(file,quality=90)
    if len(files)>16:
        indexes=[round(i*(len(files)-1)/15) for i in range(16)]
    else:
        indexes=list(range(len(files)))
    sheet([files[i] for i in indexes],[start+i/8 for i in indexes],dest/f"{mid}.jpg",f"{mid} {key} | {title}",width=250)
    return {"id":mid,"recording":key,"start_seconds":start,"duration_seconds":duration,"title":title,"video":f"evidence/motion/{mid}.mp4","strip":f"evidence/motion/{mid}.jpg","timing":"Strip labels are uniform sampled times, approximate to one sample. Source recordings are variable frame rate."}

if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results=list(pool.map(extract_job,JOBS))
    (ROOT/'motion-index.json').write_text(json.dumps(results,indent=2))
    print(f"Extracted {len(results)} original-motion excerpts and inspection strips")
