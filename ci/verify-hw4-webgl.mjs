import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=resolve('hw4/homework4'),errors=[];
await mkdir('evidence',{recursive:true});await writeFile('evidence/commit.txt',execFileSync('git',['-c',`safe.directory=${process.cwd()}`,'rev-parse','HEAD']));
const mime={'.html':'text/html','.js':'text/javascript','.glsl':'text/plain','.jpg':'image/jpeg','.png':'image/png','.gltf':'model/gltf+json'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));if(!path.startsWith(root+'/'))throw Error('path');const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:640},screen:{width:960,height:640}});
 await page.addInitScript(()=>{window.labManualRender=true;});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.labLoadError || (window.labScene&&labScene.renderer.meshes.length===41),{},{timeout:60000});
 assert.equal(await page.evaluate(()=>window.labLoadError||null),null);
 const frames=[];
 for(const [enabled,name]of [[0,'single-scattering'],[1,'kulla-conty']]){
  const f=await page.evaluate(enabled=>{setCompensation(enabled);labScene.renderer.render();const gl=labScene.gl,p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return {pixels:Array.from(p),png:gl.canvas.toDataURL('image/png'),error:gl.getError()};},enabled);
  await writeFile(`evidence/${name}.png`,Buffer.from(f.png.split(',')[1],'base64'));await writeFile(`evidence/${name}.rgba`,new Uint8Array(f.pixels));assert.equal(f.error,0);frames.push(f);
 }
 const brighter=frames[1].pixels.filter((x,i)=>i%4!==3&&x>frames[0].pixels[i]+2).length;
 const darker=frames[1].pixels.filter((x,i)=>i%4!==3&&x<frames[0].pixels[i]-1).length;
 assert(brighter>200,'No material compensation effect');assert.equal(darker,0);
 const groups=await page.evaluate(()=>{
  const {renderer,gl}=labScene,all=renderer.meshes,groups=[];
  for(const roughness of [.15,.35,.55,.75,.95]){
   renderer.meshes=all.filter(m=>m.material instanceof KullaContyMaterial&&Math.abs(m.material.uniforms.uRoughness.value-roughness)<1e-6);
   if(renderer.meshes.length!==4)throw Error('Expected four shading-ball submeshes');
   const originals=renderer.meshes.map(m=>m.mesh.transform.translate);
   for(const mesh of renderer.meshes)mesh.mesh.transform.translate=[0,0,0];
   const means=[];
   for(const flag of [0,1]){setCompensation(flag);renderer.render();const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);let sum=0;for(let i=0;i<p.length;i+=4)sum+=p[i]+p[i+1]+p[i+2];means.push(sum/(p.length/4*3));}
   renderer.meshes.forEach((m,i)=>{m.mesh.transform.translate=originals[i];});
   groups.push({roughness,single_mean:means[0],compensated_mean:means[1],ratio:means[1]/means[0]});
  }
  renderer.meshes=all;return groups;
 });
 await writeFile('evidence/roughness-groups.json',JSON.stringify(groups,null,2));
 for(const g of groups)assert(g.compensated_mean>g.single_mean,'No compensation '+JSON.stringify(g));
 const oracle=await page.evaluate(async()=>{
  const root='./src/shaders/';const pbr=await (await fetch(root+'pbrShader/PBRFragment.glsl')).text(),kc=await(await fetch(root+'KullaContyShader/KullaContyFragment.glsl')).text();
  const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const gl=canvas.getContext('webgl');
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  const vertex=shader(gl.VERTEX_SHADER,'attribute vec2 p;varying highp vec2 vTextureCoord;varying highp vec3 vFragPos;varying highp vec3 vNormal;void main(){vTextureCoord=vec2(.5);vFragPos=vec3(0);vNormal=vec3(0,0,1);gl_Position=vec4(p,0,1);}');
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const tables=[];
  for(const filename of ['GGX_E_LUT.png','GGX_Eavg_LUT.png']){
   const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='assets/ball/'+filename;});
   const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const values=Array.from(ctx.getImageData(0,0,c.width,c.height).data);
   const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);tables.push({texture,width:c.width,height:c.height,values});
  }
  const white=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,white);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  const cases=[];
  for(const [kind,source]of [['PBR',pbr],['KC',kc]]){
   const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,shader(gl.FRAGMENT_SHADER,source));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
   const pos=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   for(const [unit,name,tex]of [[0,'uAlbedoMap',white],[1,'uBRDFLut',tables[0].texture],[2,'uEavgLut',tables[1].texture]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(gl.getUniformLocation(program,name),unit);}
   gl.uniform1f(gl.getUniformLocation(program,'uMetallic'),1);gl.uniform1f(gl.getUniformLocation(program,'uEnableComp'),1);gl.uniform3fv(gl.getUniformLocation(program,'uLightRadiance'),[1,1,1]);gl.uniform3fv(gl.getUniformLocation(program,'uLightPos'),[0,0,2]);
   for(const roughness of [.15,.55,.95])for(const cosine of [.5,.9]){
    const sine=Math.sqrt(1-cosine*cosine);gl.uniform3fv(gl.getUniformLocation(program,'uCameraPos'),[sine,0,cosine]);gl.uniform3fv(gl.getUniformLocation(program,'uLightDir'),[-sine,0,cosine]);gl.uniform1f(gl.getUniformLocation(program,'uRoughness'),roughness);gl.drawArrays(gl.TRIANGLES,0,3);const pixel=new Uint8Array(4);gl.readPixels(4,4,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);cases.push({kind,roughness,cosine,pixel:Array.from(pixel)});
   }
  }
  return {cases,tables:tables.map(({width,height,values})=>({width,height,values})),error:gl.getError()};
 });
 assert.equal(oracle.error,0);
 function lookup(table,u,v){const x=u*table.width-.5,y=(1-v)*table.height-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;let sum=0;for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=Math.max(0,Math.min(table.width-1,ix+i)),yy=Math.max(0,Math.min(table.height-1,iy+j));sum+=table.values[(yy*table.width+xx)*4]/255*(i?fx:1-fx)*(j?fy:1-fy);}return sum;}
 const checked=[];
 for(const c of oracle.cases){
  const k=(c.roughness+1)**2/8,g=c.cosine/(c.cosine*(1-k)+k),d=1/(Math.PI*c.roughness**4);const single=d*g*g/(4*c.cosine*c.cosine);const expected=[];
  for(const tint of [.827,.792,.678]){
   const favg=Math.min(1,Math.max(0,.087237+.0230685*tint-.0864902*tint*tint+.0774594*tint**3+.782654-.136432+.278708+.19744*tint+.0360605*tint*tint-.2586*tint));
   const e=lookup(oracle.tables[0],c.cosine,c.roughness),avg=lookup(oracle.tables[1],0,c.roughness);
   const extra=(1-e)**2/(Math.PI*Math.max(1-avg,1e-6))*favg*avg/Math.max(1-favg*(1-avg),1e-6);
   const radiance=(single+(c.kind==='KC'?extra:0))*c.cosine;expected.push(Math.round((radiance/(radiance+1))**(1/2.2)*255));
  }
  for(let channel=0;channel<3;channel++)assert(Math.abs(c.pixel[channel]-expected[channel])<=3,JSON.stringify({c,expected}));checked.push({...c,expected});
 }
 const delta=rough=>{const a=oracle.cases.find(c=>c.kind==='PBR'&&c.roughness===rough&&c.cosine===.5),b=oracle.cases.find(c=>c.kind==='KC'&&c.roughness===rough&&c.cosine===.5);return b.pixel[0]-a.pixel[0];};assert(delta(.95)>delta(.15)+5,'controlled-direction compensation gain');
 await writeFile('evidence/shader-oracle.json',JSON.stringify({cases:checked,high_roughness_gain:delta(.95),low_roughness_gain:delta(.15)},null,2));
 assert.deepEqual(errors,[]);await writeFile('evidence/webgl-results.json',JSON.stringify({browser:browser.version(),meshes:41,brighter_channels:brighter,darker_channels:darker,groups,errors},null,2));console.log('PASS initial Kulla-Conty scene and compensation comparison',groups);
}finally{await writeFile('evidence/browser-errors.json',JSON.stringify(errors));if(browser)await browser.close();server.close();}
