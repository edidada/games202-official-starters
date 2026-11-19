let precomputeLT = [];
const transportMode = new URLSearchParams(location.search).get('mode') || 'shadowed';
if (!['shadowed','unshadowed'].includes(transportMode)) throw new Error('Invalid transport mode');
let precomputeL = [];
var cameraPosition = [50, 0, 100];

var envmap = [
	'assets/cubemap/GraceCathedral',
	'assets/cubemap/Indoor',
	'assets/cubemap/Skybox',
];

var guiParams = {
	envmapId: 0
}

var cubeMaps = [];

//生成的纹理的分辨率，纹理必须是标准的尺寸 256*256 1024*1024  2048*2048
var resolution = 2048;

let envMapPass = null;

GAMES202Main().catch(error => {window.labLoadError=String(error);console.error(error);});

async function GAMES202Main() {
	// Init canvas and gl
	const canvas = document.querySelector('#glcanvas');
	canvas.width = window.screen.width;
	canvas.height = window.screen.height;
	const gl = canvas.getContext('webgl');
	if (!gl) {
		alert('Unable to initialize WebGL. Your browser or machine may not support it.');
		return;
	}

	// Add camera
	const camera = new THREE.PerspectiveCamera(75, gl.canvas.clientWidth / gl.canvas.clientHeight, 1e-2, 1000);
	camera.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2]);

	// Add resize listener
	function setSize(width, height) {
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	}
	setSize(canvas.clientWidth, canvas.clientHeight);
	window.addEventListener('resize', () => setSize(canvas.clientWidth, canvas.clientHeight));

	// Add camera control
	const cameraControls = new THREE.OrbitControls(camera, canvas);
	cameraControls.enableZoom = true;
	cameraControls.enableRotate = true;
	cameraControls.enablePan = true;
	cameraControls.rotateSpeed = 0.3;
	cameraControls.zoomSpeed = 1.0;
	cameraControls.panSpeed = 0.8;
	cameraControls.target.set(0, 0, 0);

	// Add renderer
	const renderer = new WebGLRenderer(gl, camera);

	// Add lights
	// light - is open shadow map == false
	let lightPos = [0, 10000, 0];
	let lightRadiance = [1, 0, 0];
	const pointLight = new PointLight(lightRadiance, lightPos, false, renderer.gl);
	renderer.addLight(pointLight);

	// Add shapes
	let skyBoxTransform = setTransform(0, 50, 50, 150, 150, 150);
	let boxTransform = setTransform(0, 0, 0, 200, 200, 200);
	let box2Transform = setTransform(0, -10, 0, 20, 20, 20);

	for (let i = 0; i < envmap.length; i++) {
		let urls = [
			envmap[i] + '/posx.jpg',
			envmap[i] + '/negx.jpg',
			envmap[i] + '/posy.jpg',
			envmap[i] + '/negy.jpg',
			envmap[i] + '/posz.jpg',
			envmap[i] + '/negz.jpg',
		];
		cubeMaps.push(new CubeTexture(gl, urls))
		await cubeMaps[i].init();
	}
	// load skybox
	loadOBJ(renderer, 'assets/testObj/', 'testObj', 'SkyBoxMaterial', skyBoxTransform);


    for (let i=0;i<envmap.length;i++) {
        const read=async file=>{
            const response=await fetch(envmap[i]+'/'+file);
            if(!response.ok)throw new Error(file+': HTTP '+response.status);
            const values=(await response.text()).trim().split(/\s+/).map(Number);
            if(values.some(x=>!Number.isFinite(x)))throw new Error('Invalid coefficients: '+file);
            return values;
        };
        const [light, transport]=await Promise.all([read('light.txt'),read('transport-'+transportMode+'.txt')]);
        if(light.length!==27 || transport.length<10 || (transport.length-1)%9!==0)
            throw new Error('Invalid SH coefficient dimensions');
        precomputeL[i]=Array.from({length:9},(_,j)=>light.slice(j*3,j*3+3));
        precomputeLT[i]=transport.slice(1);
    }
    loadOBJ(renderer, 'assets/bunny/', 'bunny', 'PRTMaterial', boxTransform);
    window.labScene={gl,renderer,camera};

	function createGUI() {
		const gui = new dat.gui.GUI();
		const panelModel = gui.addFolder('Switch Environemtn Map');
		panelModel.add(guiParams, 'envmapId', { 'GraceGathedral': 0, 'Indoor': 1, 'Skybox': 2 }).name('Envmap Name');
		panelModel.open();
	}

	createGUI();

	function mainLoop(now) {
		cameraControls.update();

		if (!window.labManualRender) renderer.render();

		requestAnimationFrame(mainLoop);
	}
	requestAnimationFrame(mainLoop);
}

function setTransform(t_x, t_y, t_z, s_x, s_y, s_z) {
	return {
		modelTransX: t_x,
		modelTransY: t_y,
		modelTransZ: t_z,
		modelScaleX: s_x,
		modelScaleY: s_y,
		modelScaleZ: s_z,
	};
}