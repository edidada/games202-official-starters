const shaderSources = new Map();
function getShaderString(filename) {
    if (!shaderSources.has(filename)) {
        shaderSources.set(filename, fetch(filename).then(response => {
            if (!response.ok) throw new Error(`Shader ${filename}: HTTP ${response.status}`);
            return response.text();
        }));
    }
    return shaderSources.get(filename);
}
