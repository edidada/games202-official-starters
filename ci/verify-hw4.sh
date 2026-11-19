#!/usr/bin/env bash
set -euo pipefail
mkdir -p evidence/normal evidence/sanitized
git rev-parse HEAD > evidence/commit.txt
for mode in normal sanitized; do
  extra=()
  if [[ "$mode" == sanitized ]]; then extra=(-DHW4_SANITIZE=ON); fi
  cmake -S hw4/lut-gen -B "hw4/lut-gen/build-$mode" -DCMAKE_BUILD_TYPE=Release "${extra[@]}" 2>&1 | tee "evidence/configure-$mode.log"
  cmake --build "hw4/lut-gen/build-$mode" -j2 2>&1 | tee "evidence/build-$mode.log"
  export ASAN_OPTIONS=detect_leaks=1:halt_on_error=1
  export UBSAN_OPTIONS=halt_on_error=1:print_stacktrace=1
  "$PWD/hw4/lut-gen/build-$mode/brdf-tests" 2>&1 | tee "evidence/tests-$mode.log"
  bin="$PWD/hw4/lut-gen/build-$mode"
  (cd "evidence/$mode"; "$bin/lut-Emu-MC"; "$bin/lut-Eavg-MC"; "$bin/lut-Emu-IS"; "$bin/lut-Eavg-IS"; "$bin/lut-check") 2>&1 | tee "evidence/lut-$mode.log"
done
for name in GGX_E_MC_LUT GGX_Eavg_MC_LUT GGX_E_LUT GGX_Eavg_LUT; do
  cmp "evidence/normal/$name.png" "evidence/sanitized/$name.png"
  cmp "evidence/normal/$name.csv" "evidence/sanitized/$name.csv"
done
cmp evidence/normal/GGX_SplitSum_LUT.png evidence/sanitized/GGX_SplitSum_LUT.png
printf '%s\n' 'PASS: normal/sanitized analytic tests and complete LUT images/CSV exact.' > evidence/offline.result

python3 - <<'PY'
from pathlib import Path
import tempfile,zipfile,shutil,subprocess
source=Path.cwd();stage=Path(tempfile.mkdtemp(prefix='hw4-source-'))
(stage/'lut-gen').mkdir();(stage/'images').mkdir();(stage/'data').mkdir()
for file in (source/'hw4/lut-gen').iterdir():
 if file.is_file() and (file.suffix in ['.cpp','.h'] or file.name=='CMakeLists.txt'):shutil.copy2(file,stage/'lut-gen'/file.name)
shutil.copytree(source/'hw4/homework4/src',stage/'webgl/src')
shutil.copy2(source/'hw4/homework4/index.html',stage/'webgl/index.html')
shutil.copy2(source/'hw4/README.md',stage/'README.md')
for file in (source/'evidence/normal').iterdir():
 if file.suffix=='.png':shutil.copy2(file,stage/'images'/file.name)
 if file.suffix=='.csv':shutil.copy2(file,stage/'data'/file.name)
archive=source/'evidence/base-source.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for file in stage.rglob('*'):
  if file.is_file():z.write(file,file.relative_to(stage))
fresh=Path(tempfile.mkdtemp(prefix='hw4-independent-'))
with zipfile.ZipFile(archive) as z:z.extractall(fresh)
shutil.copytree(source/'hw4/lut-gen/ext',fresh/'lut-gen/ext')
out=fresh/'output';out.mkdir()
with (source/'evidence/package-build.log').open('w') as log:
 subprocess.run(['cmake','-S',str(fresh/'lut-gen'),'-B',str(fresh/'build'),'-DCMAKE_BUILD_TYPE=Release'],stdout=log,stderr=subprocess.STDOUT,check=True)
 subprocess.run(['cmake','--build',str(fresh/'build'),'-j2'],stdout=log,stderr=subprocess.STDOUT,check=True)
 for name in ['brdf-tests','lut-Emu-MC','lut-Eavg-MC','lut-Emu-IS','lut-Eavg-IS','lut-check']:
  subprocess.run([str(fresh/'build'/name)],cwd=out,stdout=log,stderr=subprocess.STDOUT,check=True)
for file in out.iterdir():
 if file.suffix in ['.png','.csv']:assert file.read_bytes()==(source/'evidence/normal'/file.name).read_bytes(),file.name
(source/'evidence/native-package.result').write_text('PASS extracted source native build, analytic checks, complete LUT PNG/CSV exact.\n')
PY
