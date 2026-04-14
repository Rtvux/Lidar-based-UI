uniform float uTime;
uniform float uSize;
uniform float uBreathIntensity;
uniform float uPixelRatio;

attribute vec3 aNormal;
attribute float aRandom;

varying float vRandom;
varying float vNormalY;
varying float vDepth;

void main() {
  vRandom = aRandom;
  vNormalY = aNormal.y;

  // Very subtle breathing
  float breathPhase = uTime * 1.0 + aRandom * 6.2831;
  float breathAmount = sin(breathPhase) * uBreathIntensity;

  vec3 displaced = position + aNormal * breathAmount;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  vDepth = -mvPosition.z;

  float sizeVariation = 0.7 + 0.5 * aRandom;
  gl_PointSize = uSize * sizeVariation * uPixelRatio * (1.0 / -mvPosition.z);
  gl_PointSize = clamp(gl_PointSize, 1.0, 10.0);
}
