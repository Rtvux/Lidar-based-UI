uniform float uTime;
uniform vec3 uColorInner;
uniform vec3 uColorOuter;
uniform float uOpacity;

varying float vRandom;
varying float vNormalY;
varying float vDepth;

void main() {
  float dist = length(gl_PointCoord - 0.5);

  // Crisp circle
  if (dist > 0.45) discard;

  // Hard dot with just a soft edge
  float dot = smoothstep(0.45, 0.25, dist);

  vec3 color = uColorInner;

  // Very subtle pulse
  float pulse = 0.95 + 0.05 * sin(uTime * 1.0 + vRandom * 6.2831);

  gl_FragColor = vec4(color, dot * uOpacity * pulse);
}
