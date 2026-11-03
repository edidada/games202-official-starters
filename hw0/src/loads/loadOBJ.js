
function loadOBJ(renderer, path, name) {

	const manager = new THREE.LoadingManager();
    const assetsReady = new Promise(resolve => { manager.onLoad = resolve; });
	manager.onProgress = function (item, loaded, total) {
		console.log(item, loaded, total);
	};

	function onProgress(xhr) {
		if (xhr.lengthComputable) {
			const percentComplete = xhr.loaded / xhr.total * 100;
			console.log('model ' + Math.round(percentComplete, 2) + '% downloaded');
		}
	}
	function onError(error) { throw error || new Error("OBJ/MTL loading failed"); }

	new THREE.MTLLoader(manager)
		.setPath(path)
		.load(name + '.mtl', function (materials) {
			materials.preload();
			new THREE.OBJLoader(manager)
				.setMaterials(materials)
				.setPath(path)
				.load(name + '.obj', async function (object) {
                    try {
                    await assetsReady;
                    const images = [];
                    object.traverse(child => {
                        if (!child.isMesh) return;
                        for (const material of (Array.isArray(child.material) ? child.material : [child.material])) {
                            if (material.map && material.map.image) {
                                const image = material.map.image;
                                if (!image.complete) images.push(new Promise((resolve, reject) => {
                                    image.addEventListener('load', resolve, {once:true});
                                    image.addEventListener('error', reject, {once:true});
                                }));
                            }
                        }
                    });
                    await Promise.all(images);
					object.traverse(function (child) {
						if (child.isMesh) {
							let geo = child.geometry;
							let mat;
							if (Array.isArray(child.material)) mat = child.material[0];
							else mat = child.material;

							var indices = Array.from({ length: geo.attributes.position.count }, (v, k) => k);
							let mesh = new Mesh({ name: 'aVertexPosition', array: geo.attributes.position.array },
								{ name: 'aNormalPosition', array: geo.attributes.normal.array },
								{ name: 'aTextureCoord', array: geo.attributes.uv.array },
								indices);

							let colorMap = null;
							if (mat.map != null) colorMap = new Texture(renderer.gl, mat.map.image);
							// MARK: You can change the myMaterial object to your own Material instance

                            const myMaterial = new PhongMaterial(
                                mat.color.toArray(), colorMap, [0.3, 0.3, 0.3], 10000);
                            let meshRender = new MeshRender(renderer.gl, mesh, myMaterial);
							renderer.addMesh(meshRender);
						}
					});
				} catch (error) { window.labLoadError = String(error); console.error(error); }
                }, onProgress, onError);
		});
}
