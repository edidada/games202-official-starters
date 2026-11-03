// HW0: material uniforms and Blinn-Phong shading, in world coordinates.
const PhongVertexShader = `
attribute vec3 aVertexPosition;
attribute vec3 aNormalPosition;
attribute vec2 aTextureCoord;
uniform mat4 uModelMatrix;
uniform mat3 uNormalMatrix;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying highp vec2 vTextureCoord;
varying highp vec3 vFragPos;
varying highp vec3 vNormal;
void main() {
  vFragPos = (uModelMatrix * vec4(aVertexPosition, 1.0)).xyz;
  vNormal = uNormalMatrix * aNormalPosition;
  vTextureCoord = aTextureCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition, 1.0);
}`;

const PhongFragmentShader = `
precision highp float;
uniform sampler2D uSampler;
uniform int uTextureSample;
uniform vec3 uKd;
uniform vec3 uKs;
uniform vec3 uLightPos;
uniform vec3 uCameraPos;
uniform float uLightIntensity;
varying highp vec2 vTextureCoord;
varying highp vec3 vFragPos;
varying highp vec3 vNormal;
void main() {
  vec3 color = uKd;
  if (uTextureSample == 1) {
    color = pow(texture2D(uSampler, vTextureCoord).rgb, vec3(2.2));
  }
  vec3 delta = uLightPos - vFragPos;
  float attenuation = uLightIntensity / max(dot(delta, delta), 0.0001);
  vec3 light = normalize(delta);
  vec3 normal = normalize(vNormal);
  vec3 view = normalize(uCameraPos - vFragPos);
  vec3 halfway = normalize(light + view);
  float diffuse = max(dot(normal, light), 0.0);
  float specular = 0.0;
  if (diffuse > 0.0) {
    specular = pow(max(dot(normal, halfway), 0.0), 35.0);
  }
  vec3 linear = 0.05 * color + attenuation * (diffuse * color + specular * uKs);
  gl_FragColor = vec4(pow(max(linear, vec3(0.0)), vec3(1.0/2.2)), 1.0);
}`;

class PhongMaterial extends Material {
  constructor(color, colorMap, specular, intensity) {
    const uniforms = {
      uTextureSample: {type: '1i', value: colorMap ? 1 : 0},
      uKd: {type: '3fv', value: color},
      uKs: {type: '3fv', value: specular},
      uLightIntensity: {type: '1f', value: intensity},
    };
    if (colorMap) uniforms.uSampler = {type: 'texture', value: colorMap};
    super(uniforms, [], PhongVertexShader, PhongFragmentShader);
  }
}
