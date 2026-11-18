import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile, cp, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
let root=resolve('hw1/homework1');
await mkdir('evidence',{recursive:true});
await writeFile('evidence/commit.txt',execFileSync('git',['rev-parse','HEAD']));
const mime={'.js':'text/javascript','.glsl':'text/plain','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.obj':'text/plain','.mtl':'text/plain'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!path.startsWith(root+'/'))throw Error('path');
 const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(data);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const errors=[];
try{
 browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:720},screen:{width:960,height:720}});
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.labScene?.renderer.meshes.length===5&&labScene.renderer.shadowMeshes.length===5,{},{timeout:60000});
 await page.waitForTimeout(2000);
 const matrixChecks=await page.evaluate(()=>{
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0), sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const norm=a=>a.map(x=>x/Math.hypot(...a));
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  let maxError=0;
  for(let i=0;i<100;i++){
   const light={lightPos:[12+i*.2,80,80],focalPoint:[1,2,-3],lightUp:[0,1,0]};
   const t=[i*.1,-2,3],scale=[1+i*.01,2,3],point=[.2,-.3,.7];
   const m=DirectionalLight.prototype.CalcLightMVP.call(light,t,scale);
   const world=point.map((x,j)=>x*scale[j]+t[j]);
   const z=norm(sub(light.lightPos,light.focalPoint)),x=norm(cross(light.lightUp,z)),y=cross(z,x);
   const rel=sub(world,light.lightPos),view=[dot(x,rel),dot(y,rel),dot(z,rel)];
   const expected=[view[0]/100,view[1]/100,-2*view[2]/299-301/299,1];
   for(let row=0;row<4;row++){
    const actual=m[row]*point[0]+m[row+4]*point[1]+m[row+8]*point[2]+m[row+12];
    maxError=Math.max(maxError,Math.abs(actual-expected[row]));
   }
  }
  return {cases:100,maxError};
 });
 assert(matrixChecks.maxError<1e-6,JSON.stringify(matrixChecks));
 await writeFile('evidence/matrix-checks.json',JSON.stringify(matrixChecks,null,2));
 const source=await readFile(root+'/src/shaders/phongShader/phongFragment.glsl','utf8');
 const oracle=await page.evaluate(source=>{
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=1;
  const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true});
  function compile(type,text){const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  const functions=source.slice(0,source.indexOf('vec3 blinnPhong()'));
  const f=compile(gl.FRAGMENT_SHADER,functions+`uniform float receiver; uniform float mode;
  void main(){vec4 c=vec4(0.45+gl_FragCoord.x/512.0*0.1,0.5,receiver,1.0);
  float v=mode<0.5?useShadowMap(uShadowMap,c):(mode<1.5?PCF(uShadowMap,c):PCSS(uShadowMap,c));gl_FragColor=vec4(v,v,v,1.0);}`);
  const v=compile(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}');
  const program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const a=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  // Independent CPU base-256 encoding: left half at depth .3, right half clear.
  const data=new Uint8Array(2048*2048*4);
  const shifts=[1,256,65536,16777216];const fract=x=>x-Math.floor(x);
  const rgba=shifts.map(x=>fract(.3*x));const packed=rgba.map((x,i)=>Math.round((x-(i<3?rgba[i+1]/256:0))*255));
  for(let y=0;y<2048;y++)for(let x=0;x<2048;x++)for(let c=0;c<4;c++)data[(y*2048+x)*4+c]=x<1024?packed[c]:255;
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2048,2048,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
  const cases=[];
  for(const mode of [0,1,2])for(const depth of [.2,.4,.6,.9,1.2]){
   gl.uniform1f(gl.getUniformLocation(program,'receiver'),depth);gl.uniform1f(gl.getUniformLocation(program,'mode'),mode);
   gl.drawArrays(gl.TRIANGLES,0,3);const pixels=new Uint8Array(512*4);gl.readPixels(0,0,512,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   const values=Array.from({length:512},(_,i)=>pixels[4*i]);
   cases.push({mode,depth,partial:values.filter(x=>x>0&&x<255).length,min:Math.min(...values),max:Math.max(...values),values});
  }
  return {cases,error:gl.getError(),packed};
 },source);
 assert.equal(oracle.error,0);
 for(const c of oracle.cases){
  if(c.depth===.2||c.depth===1.2)assert.equal(c.min,255,JSON.stringify(c));
  else {assert.equal(c.min,0);assert.equal(c.max,255);if(c.mode===0)assert.equal(c.partial,0);else assert(c.partial>0);}
 }
 const widths=oracle.cases.filter(c=>c.mode===2&&[.4,.6,.9].includes(c.depth)).map(c=>c.partial);
 assert(widths[0]<widths[1]&&widths[1]<widths[2],JSON.stringify(widths));
 await writeFile('evidence/shader-oracle.json',JSON.stringify(oracle,null,2));
 const frames=[];
 for(const [mode,name]of [[3,'unshadowed'],[0,'SM_scene'],[1,'PCF_scene'],[2,'PCSS_scene']]){
  const frame=await page.evaluate(mode=>{setShadowMode(mode);labScene.renderer.render();const gl=labScene.gl;
   const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);
   return {width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,pixels:Array.from(p),error:gl.getError()};},mode);
  assert.equal(frame.error,0);assert(frame.pixels.filter((v,i)=>i%4!==3&&v>30).length>5000);
  await page.locator('#glcanvas').screenshot({path:`evidence/${name}.png`});
  await writeFile(`evidence/${name}.rgba`,new Uint8Array(frame.pixels));frames.push(frame);
 }
 const diffs=frames.slice(1).map(f=>f.pixels.filter((v,i)=>i%4!==3&&v<frames[0].pixels[i]-5).length);
 assert(diffs.every(x=>x>1000),JSON.stringify(diffs));
 assert.notDeepEqual(frames[1].pixels,frames[2].pixels);assert.notDeepEqual(frames[2].pixels,frames[3].pixels);
 assert.deepEqual(errors,[]);
 await mkdir(root+'/images',{recursive:true});
 for(const name of ['SM_scene','PCF_scene','PCSS_scene'])await cp(`evidence/${name}.png`,root+`/images/${name}.png`);
 const zip=resolve('evidence/edidada_Homework1.zip');
 execFileSync('zip',['-qr',zip,'.','-x','lib/*','assets/*','*.pdf'],{cwd:root});
 const extracted=await mkdtemp(resolve(tmpdir(),'games202-hw1-'));
 execFileSync('unzip',['-q',zip,'-d',extracted]);
 // Submission intentionally excludes official lib/assets as required. Restore
 // only those original inputs; all application code comes from the ZIP.
 await cp(root+'/lib',extracted+'/lib',{recursive:true});
 await cp(root+'/assets',extracted+'/assets',{recursive:true});
 await page.close();
 root=extracted;
 const pkg=await browser.newPage({viewport:{width:960,height:720},screen:{width:960,height:720}});
 pkg.on('pageerror',e=>errors.push(String(e)));
 await pkg.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
 try {
  await pkg.waitForFunction(()=>window.labScene?.renderer.meshes.length===5&&labScene.renderer.shadowMeshes.length===5,{},{timeout:120000});
 } catch(error) {
  await writeFile('evidence/package-state.json',JSON.stringify(await pkg.evaluate(()=>({scene:!!window.labScene,meshes:window.labScene?.renderer.meshes.length,shadows:window.labScene?.renderer.shadowMeshes.length}))),null,2));
  throw error;
 }
 await pkg.waitForTimeout(2000);
 for(let mode=0;mode<4;mode++){
  const pixels=await pkg.evaluate(mode=>{setShadowMode(mode);labScene.renderer.render();const gl=labScene.gl,p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return Array.from(p);},mode);
  const index=mode===3?0:mode+1;
  assert.deepEqual(pixels,frames[index].pixels,'fresh ZIP frame mode '+mode);
 }
 await writeFile('evidence/package.result','PASS: ZIP excludes lib/assets/PDF, restored original inputs, four complete RGBA frames byte-identical.\n');
 await writeFile('evidence/results.json',JSON.stringify({browser:browser.version(),matrixChecks,shader_cases:oracle.cases.length,pcss_partial_widths:widths,shadow_darker_channels:diffs,meshes:5,errors},null,2));
 console.log('PASS initial shader oracle and official scene',widths,diffs);
}finally{await writeFile('evidence/browser-errors.json',JSON.stringify(errors));if(browser)await browser.close();server.close();}
