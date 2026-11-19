precision highp float;
varying vec3 vColor;
void main(){gl_FragColor=vec4(pow(max(vColor,vec3(0.0)),vec3(1.0/2.2)),1.0);}
