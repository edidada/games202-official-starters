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
  (cd "evidence/$mode"; "$bin/lut-Emu-MC"; "$bin/lut-Eavg-MC"; "$bin/lut-Emu-IS"; "$bin/lut-Eavg-IS") 2>&1 | tee "evidence/lut-$mode.log"
done
for name in GGX_E_MC_LUT GGX_Eavg_MC_LUT GGX_E_LUT GGX_Eavg_LUT; do
  cmp "evidence/normal/$name.png" "evidence/sanitized/$name.png"
  cmp "evidence/normal/$name.csv" "evidence/sanitized/$name.csv"
done
cmp evidence/normal/GGX_SplitSum_LUT.png evidence/sanitized/GGX_SplitSum_LUT.png
printf '%s\n' 'PASS: normal/sanitized analytic tests and complete LUT images/CSV exact.' > evidence/offline.result
