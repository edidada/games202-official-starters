#!/usr/bin/env bash
set -euo pipefail
mkdir -p evidence
git rev-parse HEAD > evidence/commit.txt
cmake -S hw2/prt -B hw2/prt/build -G Ninja -DCMAKE_BUILD_TYPE=Release 2>&1 | tee evidence/configure.log
cmake --build hw2/prt/build --target nori -j2 2>&1 | tee evidence/build.log
# Use exactly the WebGL mesh, preserving its triangle/normal ordering.
cp hw2/homework2/assets/bunny/bunny.obj hw2/prt/scenes/webgl-bunny.obj
python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as E
root=E.parse('hw2/prt/scenes/prt.xml').getroot()
root.find('mesh/string').set('value','webgl-bunny.obj')
root.find("integrator/integer[@name='PRTSampleCount']").set('value','1024')
for env in ['GraceCathedral','Indoor','Skybox']:
 for mode in ['unshadowed','shadowed']:
  root.find("integrator/string[@name='type']").set('value',mode)
  root.find("integrator/string[@name='cubemap']").set('value','cubemap/'+env)
  E.ElementTree(root).write('hw2/prt/scenes/'+env+'-'+mode+'.xml')
PY
for env in GraceCathedral Indoor Skybox; do
  for mode in unshadowed shadowed; do
    timeout 600 hw2/prt/build/nori --precompute "hw2/prt/scenes/$env-$mode.xml" 2>&1 | tee "evidence/$env-$mode.log"
    cp "hw2/prt/scenes/cubemap/$env/light.txt" "evidence/$env-$mode-light.txt"
    cp "hw2/prt/scenes/cubemap/$env/transport.txt" "evidence/$env-$mode-transport.txt"
  done
done
