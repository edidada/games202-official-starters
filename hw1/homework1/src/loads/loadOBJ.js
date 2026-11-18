async function loadOBJ(renderer, path, name, objMaterial, transform) {
    const manager = new THREE.LoadingManager();
    const materials = await new Promise((resolve, reject) =>
        new THREE.MTLLoader(manager).setPath(path).load(name + '.mtl', resolve, undefined, reject));
    materials.preload();
    const object = await new Promise((resolve, reject) =>
        new THREE.OBJLoader(manager).setMaterials(materials).setPath(path).load(name + '.obj', resolve, undefined, reject));
    const children = [];
    object.traverse(child => { if (child.isMesh) children.push(child); });
    for (const child of children) {
        const geo = child.geometry;
        const mat = Array.isArray(child.material) ? child.material[0] : child.material;
        const indices = Array.from({length: geo.attributes.position.count}, (_, i) => i);
        const mesh = new Mesh({name:'aVertexPosition', array:geo.attributes.position.array},
            {name:'aNormalPosition', array:geo.attributes.normal.array},
            {name:'aTextureCoord', array:geo.attributes.uv.array}, indices, transform);
        const colorMap = new Texture();
        if (mat.map) {
            const image = mat.map.image;
            if (!image.complete || !image.naturalWidth) await new Promise((resolve, reject) => {
                image.addEventListener('load', resolve, {once:true});
                image.addEventListener('error', () => reject(new Error('Image load failed: '+image.src)), {once:true});
            });
            colorMap.CreateImageTexture(renderer.gl, image);
        } else colorMap.CreateConstantTexture(renderer.gl, mat.color.toArray());
        const translation = [transform.modelTransX, transform.modelTransY, transform.modelTransZ];
        const scale = [transform.modelScaleX, transform.modelScaleY, transform.modelScaleZ];
        const light = renderer.lights[0].entity;
        if (objMaterial !== 'PhongMaterial') throw new Error('Unsupported material '+objMaterial);
        const material = await buildPhongMaterial(colorMap, mat.specular.toArray(), light, translation, scale,
            './src/shaders/phongShader/phongVertex.glsl', './src/shaders/phongShader/phongFragment.glsl');
        const shadow = await buildShadowMaterial(light, translation, scale,
            './src/shaders/shadowShader/shadowVertex.glsl', './src/shaders/shadowShader/shadowFragment.glsl');
        renderer.addMeshRender(new MeshRender(renderer.gl, mesh, material));
        renderer.addShadowMeshRender(new MeshRender(renderer.gl, mesh, shadow));
    }
    console.log('MODEL_READY', name, children.length, renderer.meshes.length);
}
