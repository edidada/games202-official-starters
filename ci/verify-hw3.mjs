import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve('hw3'),errors=[],records=[];
await mkdir('evidence',{recursive:true});await writeFile('evidence/commit.txt',execFileSync('git',['-c',`safe.directory=${process.cwd()}`,'rev-parse','HEAD']));
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
 const oraclePage=await browser.newPage();
 const fragment=await readFile(root+'/src/shaders/ssrShader/ssrFragment.glsl','utf8');
 const oracle=await oraclePage.evaluate(fragment=>{
  const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;
  const gl=canvas.getContext('webgl');if(!gl.getExtension('OES_texture_float'))throw Error('float textures');
  function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;}
  const vertex=compile(gl.VERTEX_SHADER,'attribute vec2 p;uniform mat4 matrix;varying mat4 vWorldToScreen;void main(){vWorldToScreen=matrix;gl_Position=vec4(p,0,1);}');
  const prefix=fragment.slice(0,fragment.indexOf('#define SAMPLE_NUM'));
  const directFunction=fragment.slice(fragment.indexOf('vec3 DirectAt'),fragment.indexOf('void main()'));
  const pixel=compile(gl.FRAGMENT_SHADER,prefix+directFunction+'uniform vec3 origin;uniform vec3 direction;uniform float kind;uniform vec3 outgoing;void main(){if(kind>0.5){gl_FragColor=vec4(DirectAt(vec2(0.5),outgoing),1.0);return;}vec3 hit;bool found=RayMarch(origin,normalize(direction),hit);gl_FragColor=vec4(found?1.0:0.0,hit/16.0+0.5);}');
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,pixel);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const near=.1,far=20;const matrix=new Float32Array([1,0,0,0,0,1,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);gl.uniformMatrix4fv(gl.getUniformLocation(program,'matrix'),false,matrix);
  const size=64;
  function texture(unit,name,kind){const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);const a=new Float32Array(size*size*4);
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4;if(kind==='depth')a[i]=4;else if(kind==='normal')a[i+2]=1;else if(kind==='position'){a[i]=(2*(x+.5)/size-1)*4;a[i+1]=(2*(y+.5)/size-1)*4;a[i+2]=-4;}else if(kind==='diffuse'){a[i]=.5;a[i+1]=.25;a[i+2]=.75;}a[i+3]=1;}
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.FLOAT,a);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,name),unit);return t;
  }
  const depth=texture(0,'uGDepth','depth');texture(1,'uGNormalWorld','normal');texture(2,'uGPosWorld','position');
  const cases=[];
  for(const [origin,direction,expected] of [[[0,0,-1],[0,0,-1],true],[[0,0,-1],[.2,.1,-1],true],[[0,0,-1],[1,0,0],false],[[0,0,-1],[0,0,1],false],[[0,0,-6],[0,0,-1],false]]){
   gl.uniform3fv(gl.getUniformLocation(program,'origin'),origin);gl.uniform3fv(gl.getUniformLocation(program,'direction'),direction);gl.drawArrays(gl.TRIANGLES,0,3);const p=new Uint8Array(4);gl.readPixels(4,4,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);cases.push({origin,direction,expected,found:p[0]>128,hit:Array.from(p.slice(1)).map(x=>(x/255-.5)*16)});
  }
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,depth);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.FLOAT,new Float32Array(size*size*4));gl.uniform3fv(gl.getUniformLocation(program,'origin'),[0,0,-1]);gl.uniform3fv(gl.getUniformLocation(program,'direction'),[0,0,-1]);gl.drawArrays(gl.TRIANGLES,0,3);const p=new Uint8Array(4);gl.readPixels(4,4,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);
  const emptyFound=p[0]>128;
  texture(3,'uGDiffuse','diffuse');const shadow=texture(4,'uGShadow','shadow');
  gl.uniform1f(gl.getUniformLocation(program,'kind'),1);
  gl.uniform3fv(gl.getUniformLocation(program,'uLightRadiance'),[2,3,4]);
  const directCases=[];
  for(const [visibility,lightZ,outZ] of [[0,1,1],[.25,1,1],[1,1,1],[1,-1,1],[1,1,-1]]){
   const data=new Float32Array(size*size*4);for(let i=0;i<data.length;i+=4){data[i]=visibility;data[i+3]=1;}
   gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,shadow);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.FLOAT,data);
   gl.uniform3fv(gl.getUniformLocation(program,'uLightDir'),[0,0,lightZ]);gl.uniform3fv(gl.getUniformLocation(program,'outgoing'),[0,0,outZ]);
   gl.drawArrays(gl.TRIANGLES,0,3);const pixel=new Uint8Array(4);gl.readPixels(4,4,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);directCases.push({visibility,lightZ,outZ,pixel:Array.from(pixel)});
  }
  return {cases,empty_found:emptyFound,directCases,error:gl.getError()};
 },fragment);
 assert.equal(oracle.error,0);assert.equal(oracle.empty_found,false);
 for(const c of oracle.cases){assert.equal(c.found,c.expected,JSON.stringify(c));if(c.expected){const t=(-4-c.origin[2])/c.direction[2];const expected=c.origin.map((x,i)=>x+t*c.direction[i]);assert(Math.hypot(...expected.map((x,i)=>x-c.hit[i]))<.16,JSON.stringify(c));}}
 for(const c of oracle.directCases)for(let channel=0;channel<3;channel++){const expected=c.lightZ>0&&c.outZ>0?Math.round([.5,.25,.75][channel]**2.2/Math.PI*[2,3,4][channel]*c.visibility*255):0;assert(Math.abs(c.pixel[channel]-expected)<=2,JSON.stringify({c,channel,expected}));}
 await writeFile('evidence/raymarch-oracle.json',JSON.stringify(oracle,null,2));
 await oraclePage.close();
 assert.deepEqual(errors,[]);
 await writeFile('evidence/results.json',JSON.stringify({browser:browser.version(),records,errors},null,2));
 console.log('PASS initial three official SSR scenes',records);
}finally{await writeFile('evidence/browser-errors.json',JSON.stringify(errors));if(browser)await browser.close();server.close();}
