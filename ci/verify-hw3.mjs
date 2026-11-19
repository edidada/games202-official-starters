import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve('hw3'),errors=[],records=[];
await mkdir('evidence',{recursive:true});await writeFile('evidence/commit.txt',execFileSync('git',['rev-parse','HEAD']));
const mime={'.html':'text/html','.js':'text/javascript','.glsl':'text/plain','.png':'image/png','.jpg':'image/jpeg','.gltf':'model/gltf+json','.bin':'application/octet-stream'};
const server=createServer(async(req,res)=>{try{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root+'/'))throw Error('path');
 const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(data);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const scene of ['cube1','cube2','cave']){
  const page=await browser.newPage({viewport:{width:320,height:240},screen:{width:320,height:240}});
  await page.addInitScript(()=>{window.labManualRender=true;});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/?scene=${scene}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.labLoadError || (window.labScene && window.labExpectedMeshes>0 && labScene.renderer.meshes.length===labExpectedMeshes && labScene.renderer.shadowMeshes.length===labExpectedMeshes && labScene.renderer.bufferMeshes.length===labExpectedMeshes),{},{timeout:60000});
  assert.equal(await page.evaluate(()=>window.labLoadError||null),null);
  const frames=[];
  for(const [mode,name] of [[0,'direct'],[1,'combined'],[2,'indirect'],[3,'mirror']]){
   const frame=await page.evaluate(mode=>{setRenderMode(mode);labScene.renderer.render();const gl=labScene.gl;
    const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return {pixels:Array.from(pixels),png:gl.canvas.toDataURL('image/png'),error:gl.getError(),meshes:labScene.renderer.meshes.length};},mode);
   await writeFile(`evidence/${scene}-${name}.png`,Buffer.from(frame.png.split(',')[1],'base64'));
   await writeFile(`evidence/${scene}-${name}.rgba`,new Uint8Array(frame.pixels));
   assert.equal(frame.error,0,scene+' '+name);
   frames.push(frame);
  }
  const lit=frames[0].pixels.filter((x,i)=>i%4!==3&&x>10).length;
  const indirect=frames[2].pixels.filter((x,i)=>i%4!==3&&x>2).length;
  const changed=frames[1].pixels.filter((x,i)=>i%4!==3&&x>frames[0].pixels[i]+2).length;
  assert(lit>1000,scene+' no direct shading');assert(indirect>30,scene+' no indirect shading');assert(changed>30,scene+' no indirect contribution');
  records.push({scene,meshes:frames[0].meshes,direct_lit_channels:lit,indirect_channels:indirect,combined_gain_channels:changed});
  await page.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile('evidence/results.json',JSON.stringify({browser:browser.version(),records,errors},null,2));
 console.log('PASS initial three official SSR scenes',records);
}finally{await writeFile('evidence/browser-errors.json',JSON.stringify(errors));if(browser)await browser.close();server.close();}
