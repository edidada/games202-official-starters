#!/usr/bin/env bash
set -euo pipefail
mkdir -p evidence
git rev-parse HEAD > evidence/commit.txt
cmake -S hw2/prt -B hw2/prt/build -G Ninja -DCMAKE_BUILD_TYPE=Release 2>&1 | tee evidence/configure.log
cmake --build hw2/prt/build --target nori -j2 2>&1 | tee evidence/build.log
hw2/prt/build/nori --prt-selftest 2>&1 | tee evidence/environment-oracle.log
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
    cp "evidence/$env-$mode-transport.txt" "hw2/homework2/assets/cubemap/$env/transport-$mode.txt"
    cp "evidence/$env-$mode-light.txt" "hw2/homework2/assets/cubemap/$env/light.txt"
  done
done

python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as E
scene=Path('hw2/prt/scenes')
(scene/'visibility-oracle.obj').write_text("""v 0 0 0
v -1 -1 0
v 1 -1 0
v -1 -1 1
v 1 -1 1
v 1 1 1
v -1 1 1
vn 0 0 1
f 1//1 2//1 3//1
f 4//1 5//1 6//1
f 4//1 6//1 7//1
""")
r=E.parse(scene/'prt.xml').getroot()
r.find('mesh/string').set('value','visibility-oracle.obj')
r.find("integrator/integer[@name='PRTSampleCount']").set('value','16384')
r.find("integrator/string[@name='cubemap']").set('value','cubemap/Indoor')
for mode in ['unshadowed','shadowed']:
 r.find("integrator/string[@name='type']").set('value',mode)
 E.ElementTree(r).write(scene/('visibility-'+mode+'.xml'))
PY
for mode in unshadowed shadowed; do
  timeout 120 hw2/prt/build/nori --precompute "hw2/prt/scenes/visibility-$mode.xml" 2>&1 | tee "evidence/visibility-$mode.log"
  cp hw2/prt/scenes/cubemap/Indoor/transport.txt "evidence/visibility-$mode-transport.txt"
done
python3 - <<'PY'
from pathlib import Path
import math,json
root=Path('evidence');normals=[];face=[]
for line in Path('hw2/homework2/assets/bunny/bunny.obj').read_text().splitlines():
 w=line.split()
 if not w:continue
 if w[0]=='vn':
  n=list(map(float,w[1:4]));r=math.sqrt(sum(x*x for x in n));normals.append([x/r for x in n])
 if w[0]=='f':
  ids=[int(x.split('/')[2])-1 for x in w[1:]]
  for i in range(1,len(ids)-1):face.extend([ids[0],ids[i],ids[i+1]])
checks=[]
for env in ['GraceCathedral','Indoor','Skybox']:
 u=list(map(float,(root/f'{env}-unshadowed-transport.txt').read_text().split()))[1:]
 t=list(map(float,(root/f'{env}-shadowed-transport.txt').read_text().split()))[1:]
 assert len(u)==len(t)==len(face)*9 and all(math.isfinite(x) for x in u+t)
 errs=[]
 for i,ni in enumerate(face):
  x,y,z=normals[ni]
  basis=[1/math.sqrt(4*math.pi),-math.sqrt(3/(4*math.pi))*y,math.sqrt(3/(4*math.pi))*z,-math.sqrt(3/(4*math.pi))*x,math.sqrt(15/(4*math.pi))*x*y,-math.sqrt(15/(4*math.pi))*y*z,math.sqrt(5/(16*math.pi))*(3*z*z-1),-math.sqrt(15/(4*math.pi))*x*z,math.sqrt(15/(16*math.pi))*(x*x-y*y)]
  kernel=[math.pi]+[2*math.pi/3]*3+[math.pi/4]*5
  errs.extend(abs(u[9*i+j]-basis[j]*kernel[j]) for j in range(9))
  assert -1e-6<=t[9*i]<=u[9*i]+1e-5
 rms=math.sqrt(sum(x*x for x in errs)/len(errs))
 assert max(errs)<.04 and rms<.01,(max(errs),rms)
 occluded=sum(u[i]-t[i]>.01 for i in range(0,len(u),9))
 assert occluded>100,occluded
 checks.append(dict(environment=env,face_vertices=len(face),rgb_independent_transport_coefficients=len(u),max_error=max(errs),rms_error=rms,occluded_vertices=occluded))
# Independent area integral over the upper square: cos(theta)*dOmega =
# h^2/(x^2+y^2+h^2)^2 dxdy. The receiver is at origin + normal*1e-4.
u=list(map(float,(root/'visibility-unshadowed-transport.txt').read_text().split()))[1:10]
t=list(map(float,(root/'visibility-shadowed-transport.txt').read_text().split()))[1:10]
n=400;h=1-1e-4;integrals=[0.0]*9
for row in range(n):
 for col in range(n):
  a=-1+(col+.5)*2/n;b=-1+(row+.5)*2/n;r2=a*a+b*b+h*h
  length=math.sqrt(r2);x=a/length;y=b/length;z=h/length
  basis=[1/math.sqrt(4*math.pi),-math.sqrt(3/(4*math.pi))*y,math.sqrt(3/(4*math.pi))*z,-math.sqrt(3/(4*math.pi))*x,math.sqrt(15/(4*math.pi))*x*y,-math.sqrt(15/(4*math.pi))*y*z,math.sqrt(5/(16*math.pi))*(3*z*z-1),-math.sqrt(15/(4*math.pi))*x*z,math.sqrt(15/(16*math.pi))*(x*x-y*y)]
  weight=h*h/(r2*r2)*(2/n)**2
  for j in range(9):integrals[j]+=basis[j]*weight
errors=[abs((u[j]-t[j])-integrals[j]) for j in range(9)]
assert max(errors)<.01,(u,t,integrals,errors)
(root/'visibility-oracle.json').write_text(json.dumps(dict(samples=16384,independent_rectangle_cells=n*n,receiver_offset=1e-4,expected_blocked=integrals,observed_blocked=[a-b for a,b in zip(u,t)],max_error=max(errors)),indent=2))
(root/'transport-oracle.json').write_text(json.dumps(checks,indent=2))
print('PASS analytic clamped-cosine SH and nonnegative visibility attenuation',checks)
PY
node ci/verify-hw2-webgl.mjs
