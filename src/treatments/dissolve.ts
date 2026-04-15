import * as THREE from 'three'
import type { TreatmentDef, TreatmentValues, UniformExtras, TreatmentControlDef } from './index'
import { NOISE_3D_GLSL } from './shaderLib'

const controls: TreatmentControlDef[] = [
  { key: 'dissolveAmount', label: 'Dissolve Amount', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.0 },
  { key: 'noiseScale', label: 'Noise Scale', type: 'slider', min: 1, max: 20, step: 0.5, defaultValue: 5.0 },
  { key: 'driftSpeed', label: 'Drift Speed', type: 'slider', min: 0, max: 3, step: 0.1, defaultValue: 0.8 },
  { key: 'edgeGlowColor', label: 'Edge Glow Color', type: 'color', defaultColor: '#ff6b00' },
  { key: 'edgeGlowWidth', label: 'Edge Glow Width', type: 'slider', min: 0.01, max: 0.3, step: 0.01, defaultValue: 0.05 },
]

const vertexShader = `
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  ${NOISE_3D_GLSL}

  uniform float uDissolveAmount;
  uniform float uNoiseScale;
  uniform vec3 uEdgeGlowColor;
  uniform float uEdgeGlowWidth;
  uniform vec3 uBaseColor;

  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    float n = snoise(vWorldPos * uNoiseScale);
    float threshold = uDissolveAmount * 2.0 - 1.0;

    if (n < threshold) discard;

    float edgeDist = n - threshold;
    float edgeGlow = 1.0 - smoothstep(0.0, uEdgeGlowWidth, edgeDist);

    vec3 color = mix(uBaseColor, uEdgeGlowColor, edgeGlow * 0.95);
    // Add extra brightness at edge
    color += uEdgeGlowColor * edgeGlow * 1.5;

    float alpha = mix(0.85, 1.0, edgeGlow);
    gl_FragColor = vec4(color, alpha);
  }
`

// Particle shader: drift dissolved particles
const pointsVertexShader = `
  ${NOISE_3D_GLSL}

  uniform float uTime;
  uniform float uDissolveAmount;
  uniform float uNoiseScale;
  uniform float uDriftSpeed;
  uniform float uPixelRatio;
  attribute vec3 aNormal;
  attribute float aRandom;
  varying float vAlpha;
  varying float vRandom;

  void main() {
    vRandom = aRandom;
    float n = snoise(position * uNoiseScale);
    float threshold = uDissolveAmount * 2.0 - 1.0;

    // How dissolved is this particle?
    float dissolveAge = max(0.0, threshold - n);
    // Particles only visible when they're in the dissolved region
    float isDissolved = step(n, threshold);

    // Drift outward
    vec3 drift = aNormal * dissolveAge * uDriftSpeed * 2.0;
    // Add some randomness
    drift += vec3(
      sin(uTime * 0.8 + aRandom * 17.0),
      cos(uTime * 0.6 + aRandom * 13.0),
      sin(uTime * 0.7 + aRandom * 11.0)
    ) * dissolveAge * 0.3;

    vec3 displaced = position + drift;
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // Fade particle out over distance from surface
    vAlpha = isDissolved * exp(-dissolveAge * 3.0);

    float sizeVariation = 0.6 + 0.6 * aRandom;
    gl_PointSize = 8.0 * sizeVariation * uPixelRatio * isDissolved * (1.0 / -mvPos.z);
    gl_PointSize = clamp(gl_PointSize, 0.0, 20.0);
  }
`

const pointsFragmentShader = `
  uniform vec3 uEdgeGlowColor;
  varying float vAlpha;
  varying float vRandom;

  void main() {
    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.45) discard;
    float dot = smoothstep(0.45, 0.15, dist);
    gl_FragColor = vec4(uEdgeGlowColor, dot * vAlpha * 0.7);
  }
`

export const dissolveTreatment: TreatmentDef = {
  id: 'dissolve',
  name: 'Dissolve',
  description: 'Model breaks apart into particles',
  supportedViewers: ['mesh'],
  controls,
  getDefaultValues: () => ({
    dissolveAmount: 0.0,
    noiseScale: 5.0,
    driftSpeed: 0.8,
    edgeGlowColor: '#ff6b00',
    edgeGlowWidth: 0.05,
  }),
  meshVertexShader: vertexShader,
  meshFragmentShader: fragmentShader,
  pointsVertexShader,
  pointsFragmentShader,
  buildUniforms(values: TreatmentValues, extras: UniformExtras) {
    return {
      uTime: { value: 0 },
      uDissolveAmount: { value: Number(values.dissolveAmount) },
      uNoiseScale: { value: Number(values.noiseScale) },
      uDriftSpeed: { value: Number(values.driftSpeed) },
      uEdgeGlowColor: { value: new THREE.Color(String(values.edgeGlowColor)) },
      uEdgeGlowWidth: { value: Number(values.edgeGlowWidth) },
      uBaseColor: { value: new THREE.Color('#1e3a5f') },
      uPixelRatio: { value: extras.pixelRatio },
    }
  },
  materialOptions: {
    transparent: true,
    depthWrite: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  },
  needsMeshGeometry: true,
  needsSampledPoints: true,
}
