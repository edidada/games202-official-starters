precision highp float;
attribute vec3 aVertexPosition;
attribute mat3 aPrecomputeLT;
uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uLightR;
uniform mat3 uLightG;
uniform mat3 uLightB;
varying vec3 vColor;
float innerProduct(mat3 a, mat3 b) {return dot(a[0],b[0])+dot(a[1],b[1])+dot(a[2],b[2]);}
void main() {
    // Transport stores cosine visibility, so unit-albedo Lambert divides by pi.
    vColor=vec3(innerProduct(aPrecomputeLT,uLightR),innerProduct(aPrecomputeLT,uLightG),innerProduct(aPrecomputeLT,uLightB))/3.141592653589793;
    gl_Position=uProjectionMatrix*uViewMatrix*uModelMatrix*vec4(aVertexPosition,1.0);
}
