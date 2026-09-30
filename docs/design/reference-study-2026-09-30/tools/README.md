# Local evidence tooling

All processing uses local recordings, ffmpeg/ffprobe, Python with Pillow, and optional native Apple Vision OCR. Nothing is uploaded. The supplied MP4s are read-only inputs.

The bundled Python used for this study is:

```
/Users/abu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
```

From the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 /path/to/python tools-path/extract.py R1
PYTHONDONTWRITEBYTECODE=1 /path/to/python tools-path/extract.py R2
PYTHONDONTWRITEBYTECODE=1 /path/to/python tools-path/extract.py R3
PYTHONDONTWRITEBYTECODE=1 /path/to/python tools-path/curate.py
PYTHONDONTWRITEBYTECODE=1 /path/to/python tools-path/motion.py
PYTHONDONTWRITEBYTECODE=1 /path/to/python tools-path/identity-board.py
PYTHONDONTWRITEBYTECODE=1 /path/to/python tools-path/inventory-pages.py
PYTHONDONTWRITEBYTECODE=1 /path/to/python tools-path/build.py
PYTHONDONTWRITEBYTECODE=1 /path/to/python tools-path/verify.py --sources
```

Replace `tools-path` with `docs/design/reference-study-2026-09-30/tools` and `/path/to/python` with a Python runtime containing Pillow. Original paths and recording IDs are in `extract.py`. Private inspection samples default to `/tmp/metropolis-reference-inspection/cache`; set `REFERENCE_CACHE` to another private scratch location if needed. They are not retained in the repository.

`curate.py` applies conservative masks designed for these three exact recordings. Inspect any new or changed frame times manually: masks are not a general privacy detector. `motion.py` obscures the moving connected-account band in M11. Audit retained evidence after regenerating it. Never commit the private OCR cache.

`ocr.swift` accepts a text file containing one image path per line and emits text/box JSON. Compile locally with `swiftc`. Its output can contain personal account data and belongs in private scratch, not in this study. OCR supports visual checking; it is not the authority for copy or behavior.

`asset-identity-register.json` and `feature-inventory.json` are canonical documentation data. `identity-board.py` builds the inspection crop board from explicit retained-frame bounds. `inventory-pages.py` regenerates the identity table below its marker and the full feature guide from those registers. It preserves the authored introduction above the identity-table marker; edit feature guide introductions in the script if regenerating.

`build.py` creates local motion posters, embeds decoded excerpt-frame timestamps in the gallery, and creates the fidelity ledger from the screen/motion indexes, component table and both registers. Gallery search includes identity names/LG IDs and feature names/FT IDs. `verify.py` checks guide links, dimensions, clip durations, component/identity/feature references, crop bounds, register/ledger consistency and optionally the original source hashes. It does not validate a product implementation or authenticate production logos.

The gallery can be opened directly or served locally:

```sh
PYTHONDONTWRITEBYTECODE=1 /path/to/python docs/design/reference-study-2026-09-30/tools/serve.py --port 8118
```

Open `http://127.0.0.1:8118/gallery.html`. The server binds only loopback and supports video byte ranges for frame seeking. This is a temporary local evidence viewer, not a deployed site.
