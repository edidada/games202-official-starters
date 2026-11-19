async function loadGLTF(renderer,path,name,objMaterial,transform,metallic=1,roughness=.2){
 const gltf=await new Promise((resolve,reject)=>new THREE.GLTFLoader().setPath(path).load(name+'.gltf',resolve,undefined,reject));
 const children=[];gltf.scene.traverse(child=>{if(child.isMesh)children.push(child);});
 for(const child of children){
  const geo=child.geometry,mat=Array.isArray(child.material)?child.material[0]:child.material;
  const mesh=new Mesh({name:'aVertexPosition',array:geo.attributes.position.array},{name:'aNormalPosition',array:geo.attributes.normal.array},{name:'aTextureCoord',array:geo.attributes.uv.array},geo.index.array,transform);
  const albedo=new Texture();
  if(mat.map){const image=mat.map.image;if(!image.complete||!image.naturalWidth)await new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',reject,{once:true});});albedo.CreateImageTexture(renderer.gl,image);}
  else albedo.CreateConstantTexture(renderer.gl,[.7216,.451,.2],true);
  let material;
  if(objMaterial==='KullaContyMaterial')material=await buildKullaContyMaterial(albedo,metallic,roughness,brdflut,eavglut,renderer.lights[0].entity,'./src/shaders/KullaContyShader/KullaContyVertex.glsl','./src/shaders/KullaContyShader/KullaContyFragment.glsl');
  else if(objMaterial==='PBRMaterial')material=await buildPBRMaterial(albedo,metallic,roughness,brdflut,renderer.lights[0].entity,'./src/shaders/pbrShader/PBRVertex.glsl','./src/shaders/pbrShader/PBRFragment.glsl');
  else throw new Error('unsupported material');
  renderer.addMeshRender(new MeshRender(renderer.gl,mesh,material));
 }
}
