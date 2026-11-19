#ifdef GL_ES
precision highp float;
#endif

// Phong related variables
uniform sampler2D uSampler;
uniform vec3 uKd;
uniform vec3 uKs;
uniform vec3 uLightPos;
uniform vec3 uCameraPos;
uniform vec3 uLightIntensity;

varying highp vec2 vTextureCoord;
varying highp vec3 vFragPos;
varying highp vec3 vNormal;

// Shadow map related variables
#define NUM_SAMPLES 32
#define BLOCKER_SEARCH_NUM_SAMPLES NUM_SAMPLES
#define PCF_NUM_SAMPLES NUM_SAMPLES
#define NUM_RINGS 11

#define EPS 1e-3
#define PI 3.141592653589793
#define PI2 6.283185307179586

uniform sampler2D uShadowMap;

varying vec4 vPositionFromLight;

highp float rand_1to1(highp float x ) { 
  // -1 -1
  return fract(sin(x)*10000.0);
}

highp float rand_2to1(vec2 uv ) { 
  // 0 - 1
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract(sin(sn) * c);
}

float unpack(vec4 rgbaDepth) {
    const vec4 bitShift = vec4(1.0, 1.0/255.0, 1.0/(255.0*255.0), 1.0/(255.0*255.0*255.0));
    return dot(rgbaDepth, bitShift);
}

vec2 poissonDisk[NUM_SAMPLES];

void poissonDiskSamples( const in vec2 randomSeed ) {

  float ANGLE_STEP = PI2 * float( NUM_RINGS ) / float( NUM_SAMPLES );
  float INV_NUM_SAMPLES = 1.0 / float( NUM_SAMPLES );

  float angle = rand_2to1( randomSeed ) * PI2;
  float radius = INV_NUM_SAMPLES;
  float radiusStep = radius;

  for( int i = 0; i < NUM_SAMPLES; i ++ ) {
    poissonDisk[i] = vec2( cos( angle ), sin( angle ) ) * pow( radius, 0.75 );
    radius += radiusStep;
    angle += ANGLE_STEP;
  }
}

void uniformDiskSamples( const in vec2 randomSeed ) {

  float randNum = rand_2to1(randomSeed);
  float sampleX = rand_1to1( randNum ) ;
  float sampleY = rand_1to1( sampleX ) ;

  float angle = sampleX * PI2;
  float radius = sqrt(sampleY);

  for( int i = 0; i < NUM_SAMPLES; i ++ ) {
    poissonDisk[i] = vec2( radius * cos(angle) , radius * sin(angle)  );

    sampleX = rand_1to1( sampleY ) ;
    sampleY = rand_1to1( sampleX ) ;

    angle = sampleX * PI2;
    radius = sqrt(sampleY);
  }
}

// All lengths below are in the light camera's world-space units.
#define LIGHT_NEAR 1.0
#define LIGHT_FAR 300.0
#define LIGHT_EXTENT 200.0
#define LIGHT_RADIUS 5.0
#define DEPTH_BIAS 0.0008
uniform float uShadowMode;

bool outsideMap(vec3 c) {
  return c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z < 0.0 || c.z > 1.0;
}
float compareDepth(sampler2D map, vec2 uv, float depth) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  return step(depth - DEPTH_BIAS, unpack(texture2D(map, uv)));
}
float findBlocker(sampler2D map, vec2 uv, float receiver) {
  float sum = 0.0;
  float count = 0.0;
  // A finite angular disk around the directional source. Search up to
  // the near plane; orthographic x/y widths do not divide by receiver z.
  float z = LIGHT_NEAR + receiver * (LIGHT_FAR - LIGHT_NEAR);
  float radius = LIGHT_RADIUS * (z - LIGHT_NEAR) / z / LIGHT_EXTENT;
  for (int i = 0; i < BLOCKER_SEARCH_NUM_SAMPLES; ++i) {
    vec2 pos = uv + poissonDisk[i] * radius;
    if (pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0) continue;
    float depth = unpack(texture2D(map, pos));
    if (depth < receiver - DEPTH_BIAS) {sum += depth; count += 1.0;}
  }
  return count > 0.0 ? sum / count : -1.0;
}
float filterShadow(sampler2D map, vec3 c, float radius) {
  float sum = 0.0;
  for (int i = 0; i < PCF_NUM_SAMPLES; ++i)
    sum += compareDepth(map, c.xy + poissonDisk[i] * radius, c.z);
  return sum / float(PCF_NUM_SAMPLES);
}
float PCF(sampler2D map, vec4 coords) {
  vec3 c = coords.xyz / coords.w;
  if (outsideMap(c)) return 1.0;
  poissonDiskSamples(c.xy);
  return filterShadow(map, c, 4.0 / 2048.0);
}
float PCSS(sampler2D map, vec4 coords) {
  vec3 c = coords.xyz / coords.w;
  if (outsideMap(c)) return 1.0;
  poissonDiskSamples(c.xy);
  float blocker = findBlocker(map, c.xy, c.z);
  if (blocker < 0.0) return 1.0;
  float receiverZ = LIGHT_NEAR + c.z * (LIGHT_FAR - LIGHT_NEAR);
  float blockerZ = LIGHT_NEAR + blocker * (LIGHT_FAR - LIGHT_NEAR);
  float radius = LIGHT_RADIUS * max(receiverZ - blockerZ, 0.0) / blockerZ / LIGHT_EXTENT;
  return filterShadow(map, c, radius);
}
float useShadowMap(sampler2D map, vec4 coords) {
  vec3 c = coords.xyz / coords.w;
  return outsideMap(c) ? 1.0 : compareDepth(map, c.xy, c.z);
}

vec3 blinnPhong() {
  vec3 color = texture2D(uSampler, vTextureCoord).rgb;
  color = pow(color, vec3(2.2));

  vec3 ambient = 0.05 * color;

  vec3 lightDir = normalize(uLightPos);
  vec3 normal = normalize(vNormal);
  float diff = max(dot(lightDir, normal), 0.0);
  vec3 light_atten_coff =
      uLightIntensity / pow(length(uLightPos - vFragPos), 2.0);
  vec3 diffuse = diff * light_atten_coff * color;

  vec3 viewDir = normalize(uCameraPos - vFragPos);
  vec3 halfDir = normalize((lightDir + viewDir));
  float spec = pow(max(dot(halfDir, normal), 0.0), 32.0);
  vec3 specular = uKs * light_atten_coff * spec;

  vec3 radiance = (ambient + diffuse + specular);
  vec3 phongColor = pow(radiance, vec3(1.0 / 2.2));
  return phongColor;
}

void main(void) {

  vec4 coord = vec4(vPositionFromLight.xyz * 0.5 + vPositionFromLight.www * 0.5, vPositionFromLight.w);
  float visibility = 1.0;
  if (uShadowMode < 0.5) visibility = useShadowMap(uShadowMap, coord);
  else if (uShadowMode < 1.5) visibility = PCF(uShadowMap, coord);
  else if (uShadowMode < 2.5) visibility = PCSS(uShadowMap, coord);
  gl_FragColor = vec4(blinnPhong() * visibility, 1.0);
}
