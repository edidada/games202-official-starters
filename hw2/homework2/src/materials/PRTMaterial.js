class PRTMaterial extends Material {
    constructor(vertex, fragment) {
        super({
            uLightR: {type:'matrix3fv', value:new Float32Array(9)},
            uLightG: {type:'matrix3fv', value:new Float32Array(9)},
            uLightB: {type:'matrix3fv', value:new Float32Array(9)}
        }, ['aPrecomputeLT'], vertex, fragment, null);
    }
    updateLight(coefficients) {
        for (let c=0;c<3;c++) {
            const key=['uLightR','uLightG','uLightB'][c];
            this.uniforms[key].value.set(coefficients.map(row=>row[c]));
        }
    }
}
async function buildPRTMaterial() {
    const [vertex, fragment]=await Promise.all([
        getShaderString('./src/shaders/prtShader/prtVertex.glsl'),
        getShaderString('./src/shaders/prtShader/prtFragment.glsl')]);
    return new PRTMaterial(vertex,fragment);
}
