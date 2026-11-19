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
 assert(groups[4].ratio>groups[0].ratio,'High roughness compensation should be stronger');
 assert.deepEqual(errors,[]);await writeFile('evidence/webgl-results.json',JSON.stringify({browser:browser.version(),meshes:41,brighter_channels:brighter,darker_channels:darker,groups,errors},null,2));console.log('PASS initial Kulla-Conty scene and compensation comparison',groups);
}finally{await writeFile('evidence/browser-errors.json',JSON.stringify(errors));if(browser)await browser.close();server.close();}
