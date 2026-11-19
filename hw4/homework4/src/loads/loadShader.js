const shaderSources=new Map();
function getShaderString(filename){if(!shaderSources.has(filename))shaderSources.set(filename,fetch(filename).then(r=>{if(!r.ok)throw new Error(filename+': '+r.status);return r.text();}));return shaderSources.get(filename);}
