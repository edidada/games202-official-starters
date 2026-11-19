import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('hw2/homework2'), errors=[];
const mime={'.html':'text/html','.js':'text/javascript','.glsl':'text/plain','.jpg':'image/jpeg','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root+'/'))throw Error('path');
 res.writeHead(200,{'Content-Type':mime[extname(path)]||'text/plain'});res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const records=[], frames={};
try {
 browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mode of ['unshadowed','shadowed']){
  const page=await browser.newPage({viewport:{width:800,height:600},screen:{width:800,height:600}});
  await page.addInitScript(()=>{window.labManualRender=true;});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.labLoadError || (window.labScene && labScene.renderer.meshes.some(m=>m.material instanceof PRTMaterial)),{},{timeout:60000});
  assert.equal(await page.evaluate(()=>window.labLoadError||null),null);
  const metrics=await page.evaluate(()=>{
   const {gl,renderer,camera}=labScene;
   const model=renderer.meshes.find(m=>m.material instanceof PRTMaterial);
   if(model.mesh.count!==6000)throw Error('Expected 6000 face vertices');
   const base=gl.createBuffer.bind(gl);let allocations=0;gl.createBuffer=()=>{allocations++;return base();};
   const records=[];
   for(let env=0;env<3;env++){
    guiParams.envmapId=env;renderer.render();
    const full=gl.canvas.toDataURL('image/png');
    const meshes=renderer.meshes;renderer.meshes=[model];renderer.render();
    const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    const isolated=gl.canvas.toDataURL('image/png');renderer.meshes=meshes;
    records.push({env,full,isolated,pixels:Array.from(bytes),error:gl.getError()});
   }
   const before=allocations;
   for(let i=0;i<30;i++){guiParams.envmapId=i%3;renderer.render();}
   return {records,allocations,extra:allocations-before,cached:model.transportBuffers.size,meshes:renderer.meshes.length};
  });
  assert.equal(metrics.extra,0);assert.equal(metrics.cached,3);
  for(const r of metrics.records){
   assert.equal(r.error,0);
   const colored=r.pixels.filter((v,i)=>i%4!==3&&v>10).length;
   assert(colored>500,'No actual PRT model pixels');
   const prefix=`PRT_${mode==='unshadowed'?'Unshadowed':'Shadowed'}_${r.env}`;
   await writeFile(`evidence/${prefix}.png`,Buffer.from(r.full.split(',')[1],'base64'));
   await writeFile(`evidence/${prefix}-isolated.png`,Buffer.from(r.isolated.split(',')[1],'base64'));
   await writeFile(`evidence/${prefix}.rgba`,new Uint8Array(r.pixels));
   frames[`${mode}-${r.env}`]=r.pixels;
   records.push({mode,env:r.env,colored_channels:colored,cached_buffers:metrics.cached,extra_buffers_after_30_frames:metrics.extra});
  }
  if(mode==='unshadowed'){
   const shaderCases=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;
    const gl=canvas.getContext('webgl');
    const material=await buildPRTMaterial();material.setMeshAttribs(['aVertexPosition']);
    const shader=material.compile(gl),program=shader.program;gl.useProgram(program.glShaderProgram);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),gl.STATIC_DRAW);
    const pos=program.attribs.aVertexPosition;gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,0,0);
    const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
    for(const k of ['uModelMatrix','uViewMatrix','uProjectionMatrix'])gl.uniformMatrix4fv(program.uniforms[k],false,identity);
    const result=[];
    for(const sign of [1,.5,-1]){
     const lt=Array.from({length:9},(_,i)=>(i+1)*.05*sign);
     const base=program.attribs.aPrecomputeLT;
     for(let c=0;c<3;c++){gl.disableVertexAttribArray(base+c);gl.vertexAttrib3f(base+c,...lt.slice(c*3,c*3+3));}
     const lights=[Array(9).fill(.2),Array.from({length:9},(_,i)=>i*.03),Array(9).fill(.05)];
     for(let c=0;c<3;c++)gl.uniformMatrix3fv(program.uniforms[['uLightR','uLightG','uLightB'][c]],false,new Float32Array(lights[c]));
     gl.drawArrays(gl.TRIANGLES,0,3);const pixel=new Uint8Array(4);gl.readPixels(4,4,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
     result.push({lt,lights,pixel:Array.from(pixel),error:gl.getError()});
    }
    return result;
   });
   for(const c of shaderCases){assert.equal(c.error,0);for(let channel=0;channel<3;channel++){
    const sum=c.lt.reduce((s,x,i)=>s+x*c.lights[channel][i],0)/Math.PI;
    const expected=Math.round(Math.min(1,Math.max(0,sum)**(1/2.2))*255);
    assert(Math.abs(expected-c.pixel[channel])<=2,JSON.stringify({c,channel,expected}));
   }}
   await writeFile('evidence/prt-shader-oracle.json',JSON.stringify(shaderCases,null,2));
  }
  await page.close();
 }
 const differences=[];
 for(let env=0;env<3;env++){
  const a=frames[`unshadowed-${env}`],b=frames[`shadowed-${env}`];
  const changed=a.filter((x,i)=>i%4!==3&&Math.abs(x-b[i])>3).length;
  assert(changed>100,'No visible shadowed transport effect');differences.push(changed);
 }
 assert.notDeepEqual(frames['unshadowed-0'],frames['unshadowed-1']);
 assert.notDeepEqual(frames['unshadowed-1'],frames['unshadowed-2']);
 assert.deepEqual(errors,[]);
 await writeFile('evidence/webgl-results.json',JSON.stringify({browser:browser.version(),records,shadow_difference_channels:differences,shader_oracle_cases:3,errors},null,2));
 console.log('PASS six PRT environment/mode renders, shader oracle and buffer reuse',differences);
}finally{await writeFile('evidence/webgl-errors.json',JSON.stringify(errors));if(browser)await browser.close();server.close();}
