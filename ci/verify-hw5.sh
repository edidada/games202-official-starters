#!/usr/bin/env bash
set -euo pipefail
mkdir -p evidence
export OMP_NUM_THREADS=2
for mode in normal sanitized; do
  flags=OFF; [[ "$mode" == sanitized ]] && flags=ON
  cmake -S hw5 -B "build-$mode" -DCMAKE_BUILD_TYPE=Release -DHW5_SANITIZE="$flags" 2>&1 | tee "evidence/configure-$mode.log"
  cmake --build "build-$mode" -j2 2>&1 | tee "evidence/build-$mode.log"
  ASAN_OPTIONS=detect_leaks=1:halt_on_error=1 UBSAN_OPTIONS=halt_on_error=1 "build-$mode/denoiser-tests" "evidence/$mode" 2>&1 | tee "evidence/tests-$mode.log"
  ASAN_OPTIONS=detect_leaks=1:halt_on_error=1 UBSAN_OPTIONS=halt_on_error=1 "build-$mode/io-tests" "evidence/$mode/input" 2>&1 | tee "evidence/io-$mode.log"
  ASAN_OPTIONS=detect_leaks=1:halt_on_error=1 UBSAN_OPTIONS=halt_on_error=1 "build-$mode/Denoise" "evidence/$mode/input" "evidence/$mode/output" 2 2>&1 | tee "evidence/cli-$mode.log"
done
diff -r evidence/normal evidence/sanitized
ffmpeg -y -framerate 6 -i evidence/normal/result-%02d.ppm -c:v libx264 -pix_fmt yuv420p evidence/synthetic-result.mp4
printf 'PASS normal/sanitized analytic tests and complete synthetic images exact; official scenes not yet verified.\n' > evidence/result.txt
git rev-parse HEAD > evidence/commit.txt
