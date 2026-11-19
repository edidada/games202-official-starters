#ifdef GL_ES
precision highp float;
#endif

uniform vec3 uLightPos;
uniform vec3 uCameraPos;
uniform vec3 uLightRadiance;
uniform vec3 uLightDir;

uniform sampler2D uAlbedoMap;
uniform float uMetallic;
uniform float uRoughness;
uniform sampler2D uBRDFLut;
uniform samplerCube uCubeTexture;

varying highp vec2 vTextureCoord;
varying highp vec3 vFragPos;
varying highp vec3 vNormal;

const float PI = 3.14159265359;

float DistributionGGX(vec3 N,vec3 H,float roughness){
 float a=max(roughness*roughness,1e-8),a2=a*a,nh=max(dot(N,H),0.0);
 float denom=(1.0-nh*nh)+nh*nh*a2;
 return a2/max(PI*denom*denom,1e-20);
}
float GeometrySchlickGGX(float nv,float roughness){
 float k=(roughness+1.0)*(roughness+1.0)/8.0;
 return nv<=0.0?0.0:nv/(nv*(1.0-k)+k);
}
float GeometrySmith(vec3 N,vec3 V,vec3 L,float roughness){
 return GeometrySchlickGGX(max(dot(N,V),0.0),roughness)*GeometrySchlickGGX(max(dot(N,L),0.0),roughness);
}

vec3 fresnelSchlick(vec3 F0,vec3 V,vec3 H){
 return F0+(vec3(1.0)-F0)*pow(1.0-clamp(dot(V,H),0.0,1.0),5.0);
}

void main(void) {
  vec3 albedo = pow(texture2D(uAlbedoMap, vTextureCoord).rgb, vec3(2.2));

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vFragPos);
  float NdotV = max(dot(N, V), 0.0);
 
  vec3 F0 = vec3(0.04); 
  F0 = mix(F0, albedo, uMetallic);

  vec3 Lo = vec3(0.0);

  vec3 L = normalize(uLightDir);
  vec3 H = normalize(V + L);
  float NdotL = max(dot(N, L), 0.0); 

  vec3 radiance = uLightRadiance;

  float NDF = DistributionGGX(N, H, uRoughness);   
  float G   = GeometrySmith(N, V, L, uRoughness); 
  vec3 F = fresnelSchlick(F0, V, H);
      
  vec3 numerator    = NDF * G * F; 
  float denominator = max((4.0 * NdotL * NdotV), 0.001);
  vec3 BRDF = numerator / denominator;

  Lo += BRDF * radiance * NdotL;
  vec3 color = Lo;

  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0/2.2)); 
  gl_FragColor = vec4(color, 1.0);
}