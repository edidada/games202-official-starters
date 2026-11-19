#ifdef GL_ES
precision highp float;
#endif

uniform vec3 uLightDir;
uniform vec3 uCameraPos;
uniform vec3 uLightRadiance;
uniform sampler2D uGDiffuse;
uniform sampler2D uGDepth;
uniform sampler2D uGNormalWorld;
uniform sampler2D uGShadow;
uniform sampler2D uGPosWorld;

varying mat4 vWorldToScreen;
varying highp vec4 vPosWorld;

#define M_PI 3.1415926535897932384626433832795
#define TWO_PI 6.283185307
#define INV_PI 0.31830988618
#define INV_TWO_PI 0.15915494309

float Rand1(inout float p) {
  p = fract(p * .1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 Rand2(inout float p) {
  return vec2(Rand1(p), Rand1(p));
}

float InitRand(vec2 uv) {
	vec3 p3  = fract(vec3(uv.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 SampleHemisphereUniform(inout float s, out float pdf) {
  vec2 uv = Rand2(s);
  float z = uv.x;
  float phi = uv.y * TWO_PI;
  float sinTheta = sqrt(1.0 - z*z);
  vec3 dir = vec3(sinTheta * cos(phi), sinTheta * sin(phi), z);
  pdf = INV_TWO_PI;
  return dir;
}

vec3 SampleHemisphereCos(inout float s, out float pdf) {
  vec2 uv = Rand2(s);
  float z = sqrt(1.0 - uv.x);
  float phi = uv.y * TWO_PI;
  float sinTheta = sqrt(uv.x);
  vec3 dir = vec3(sinTheta * cos(phi), sinTheta * sin(phi), z);
  pdf = z * INV_PI;
  return dir;
}

void LocalBasis(vec3 n, out vec3 b1, out vec3 b2) {
  float sign_ = sign(n.z);
  if (n.z == 0.0) {
    sign_ = 1.0;
  }
  float a = -1.0 / (sign_ + n.z);
  float b = n.x * n.y * a;
  b1 = vec3(1.0 + sign_ * n.x * n.x * a, sign_ * b, -sign_ * n.x);
  b2 = vec3(b, sign_ + n.y * n.y * a, -n.y);
}

vec4 Project(vec4 a) {
  return a / a.w;
}

float GetDepth(vec3 posWorld) {
  float depth = (vWorldToScreen * vec4(posWorld, 1.0)).w;
  return depth;
}

/*
 * Transform point from world space to screen space([0, 1] x [0, 1])
 *
 */
vec2 GetScreenCoordinate(vec3 posWorld) {
  vec2 uv = Project(vWorldToScreen * vec4(posWorld, 1.0)).xy * 0.5 + 0.5;
  return uv;
}

float GetGBufferDepth(vec2 uv) {
  float depth = texture2D(uGDepth, uv).x;
  if (depth < 1e-2) {
    depth = 1000.0;
  }
  return depth;
}

vec3 GetGBufferNormalWorld(vec2 uv) {
  vec3 normal = texture2D(uGNormalWorld, uv).xyz;
  return normal;
}

vec3 GetGBufferPosWorld(vec2 uv) {
  vec3 posWorld = texture2D(uGPosWorld, uv).xyz;
  return posWorld;
}

float GetGBufferuShadow(vec2 uv) {
  float visibility = texture2D(uGShadow, uv).x;
  return visibility;
}

vec3 GetGBufferDiffuse(vec2 uv) {
  vec3 diffuse = texture2D(uGDiffuse, uv).xyz;
  diffuse = pow(diffuse, vec3(2.2));
  return diffuse;
}

/*
 * Evaluate diffuse bsdf value.
 *
 * wi, wo are all in world space.
 * uv is in screen space, [0, 1] x [0, 1].
 *
 */
vec3 EvalDiffuse(vec3 wi, vec3 wo, vec2 uv) {
  vec3 n = normalize(GetGBufferNormalWorld(uv));
  if (dot(n, wi) <= 0.0 || dot(n, wo) <= 0.0) return vec3(0.0);
  return GetGBufferDiffuse(uv) * INV_PI;
}

/*
 * Evaluate directional light with shadow map
 * uv is in screen space, [0, 1] x [0, 1].
 *
 */
vec3 EvalDirectionalLight(vec2 uv) {
  return uLightRadiance * clamp(GetGBufferuShadow(uv), 0.0, 1.0);
}

bool ProjectRayPoint(vec3 p, out vec2 uv, out float depth) {
  vec4 clip = vWorldToScreen * vec4(p, 1.0);
  if (clip.w <= 0.0 || abs(clip.z) > clip.w) return false;
  uv = clip.xy / clip.w * 0.5 + 0.5;
  depth = clip.w;
  return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
}
bool RayMarch(vec3 ori, vec3 dir, out vec3 hitPos) {
  hitPos = vec3(0.0);
  const float stepLength = 0.1;
  for (int i = 1; i <= 128; ++i) {
    float t = float(i) * stepLength;
    vec3 p = ori + dir * t;
    vec2 uv; float depth;
    if (!ProjectRayPoint(p, uv, depth)) return false;
    float surfaceDepth = GetGBufferDepth(uv);
    float delta = depth - surfaceDepth;
    if (surfaceDepth >= 999.0 || delta < 0.0 || delta > 0.15) continue;
    float low = t - stepLength, high = t;
    for (int refine = 0; refine < 8; ++refine) {
      float mid = (low + high) * 0.5;
      vec2 midUV; float midDepth;
      if (!ProjectRayPoint(ori + mid * dir, midUV, midDepth)) return false;
      if (midDepth < GetGBufferDepth(midUV)) low = mid;
      else high = mid;
    }
    vec2 hitUV; float hitDepth;
    if (!ProjectRayPoint(ori + high * dir, hitUV, hitDepth)) return false;
    vec3 candidate = GetGBufferPosWorld(hitUV);
    // Reject self hits and depth discontinuities rather than accepting the
    // first point behind an unrelated foreground surface.
    if (length(candidate - ori) < 0.08 || length(candidate - (ori + high * dir)) > 0.18) continue;
    if (dot(normalize(GetGBufferNormalWorld(hitUV)), -dir) <= 0.0) continue;
    hitPos = candidate;
    return true;
  }
  return false;
}

#define SAMPLE_NUM 16
uniform float uRenderMode;
vec3 DirectAt(vec2 uv, vec3 outgoing) {
  vec3 n = normalize(GetGBufferNormalWorld(uv));
  vec3 incoming = normalize(uLightDir);
  return EvalDiffuse(incoming, outgoing, uv) * max(dot(n, incoming), 0.0) * EvalDirectionalLight(uv);
}
void main() {
  float s = InitRand(gl_FragCoord.xy);
  vec3 position = vPosWorld.xyz;
  vec2 uv = GetScreenCoordinate(position);
  vec3 n = normalize(GetGBufferNormalWorld(uv));
  vec3 wo = normalize(uCameraPos - position);
  vec3 direct = DirectAt(uv, wo);
  vec3 indirect = vec3(0.0);
  vec3 tangent, bitangent;
  LocalBasis(n, tangent, bitangent);
  if (uRenderMode > 0.5 && uRenderMode < 2.5) {
    for (int i = 0; i < SAMPLE_NUM; ++i) {
      float pdf;
      vec3 local = SampleHemisphereCos(s, pdf);
      vec3 wi = normalize(tangent * local.x + bitangent * local.y + n * local.z);
      vec3 hit;
      if (pdf > 1e-6 && RayMarch(position + n * 0.01, wi, hit)) {
        vec2 hitUV = GetScreenCoordinate(hit);
        indirect += EvalDiffuse(wi, wo, uv) * max(dot(n, wi), 0.0) / pdf * DirectAt(hitUV, -wi);
      }
    }
    indirect /= float(SAMPLE_NUM);
  }
  vec3 L = direct;
  if (uRenderMode > 0.5 && uRenderMode < 1.5) L += indirect;
  else if (uRenderMode > 1.5 && uRenderMode < 2.5) L = indirect;
  else if (uRenderMode > 2.5) {
    vec3 hit;
    L = RayMarch(position + n * 0.01, reflect(-wo, n), hit) ? GetGBufferDiffuse(GetScreenCoordinate(hit)) : vec3(0.0);
  }
  gl_FragColor = vec4(pow(clamp(L, vec3(0.0), vec3(1.0)), vec3(1.0 / 2.2)), 1.0);
}
