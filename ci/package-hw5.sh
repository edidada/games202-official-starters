#!/usr/bin/env bash
set -euo pipefail
# Build the submission from owned source files and explicitly named result videos.
python3 - <<'PY'
from pathlib import Path
import zipfile
root=Path('hw5')
with zipfile.ZipFile('evidence/edidada_Homework5.zip','w',zipfile.ZIP_DEFLATED) as z:
    files=[root/'CMakeLists.txt',root/'README.md',root/'LICENSE']
    files+=sorted((root/'src').rglob('*'))+sorted((root/'tests').rglob('*'))
    for p in files:
        if p.is_file() and 'ext' not in p.parts:z.write(p,p.relative_to(root))
    for name in ['synthetic-result.mp4','synthetic-moving-result.mp4']:
        z.write(Path('evidence')/name,'results/'+name)
PY
restored=$(mktemp -d)
trap 'rm -rf -- "$restored"' EXIT
python3 - "$restored" <<'PY'
import sys,zipfile
with zipfile.ZipFile('evidence/edidada_Homework5.zip') as z:z.extractall(sys.argv[1])
PY
# Bundled third-party dependencies are excluded from the ZIP; restore the exact
# starter dependency tree, just as documented for an independent recipient.
cp -R hw5/src/ext "$restored/src/ext"
cmake -S "$restored" -B "$restored/build" -DCMAKE_BUILD_TYPE=Release 2>&1 | tee evidence/package-configure.log
cmake --build "$restored/build" -j2 2>&1 | tee evidence/package-build.log
OMP_NUM_THREADS=1 "$restored/build/denoiser-tests" "$restored/outputs" 2>&1 | tee evidence/package-tests.log
# Compare every numeric record and full PPM frame against the initial build.
for f in $(find "$restored/outputs" -type f); do
  relative=${f#"$restored/outputs/"}
  cmp "$f" "evidence/normal/$relative"
done
OMP_NUM_THREADS=1 "$restored/build/Denoise" evidence/normal/input "$restored/cli-output" 2 2>&1 | tee evidence/package-cli.log
diff -r "$restored/cli-output" evidence/normal/output
printf 'PASS restored ZIP native rebuild; stationary/moving full PPM and metrics exact, CLI EXR exact, OMP1 vs OMP2 exact. Official datasets pending.\n' > evidence/package.result
