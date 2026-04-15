import * as THREE from 'three'
import type { TreatmentDef, TreatmentValues, TreatmentControlDef } from './index'

const controls: TreatmentControlDef[] = [
  { key: 'scanLineDensity', label: 'Scan Line Density', type: 'slider', min: 10, max: 200, step: 1, defaultValue: 80 },
  { key: 'scanSpeed', label: 'Scan Speed', type: 'slider', min: 0, max: 5, step: 0.1, defaultValue: 1.5 },
  { key: 'fresnelIntensity', label: 'Fresnel Intensity', type: 'slider', min: 0, max: 5, step: 0.1, defaultValue: 2.5 },
  { key: 'hologramColor', label: 'Hologram Color', type: 'color', defaultColor: '#00e5ff' },
  { key: 'flickerAmount', label: 'Flicker Amount', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.15 },
  { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.6 },
]

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform float uScanLineDensity;
  uniform float uScanSpeed;
  uniform float uFresnelIntensity;
  uniform vec3 uHologramColor;
  uniform float uFlickerAmount;
  uniform float uOpacity;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    // Fresnel edge glow
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), uFresnelIntensity);

    // Scan lines moving along Y
    float scanLine = sin((vWorldPos.y + uTime * uScanSpeed) * uScanLineDensity) * 0.5 + 0.5;
    scanLine = smoothstep(0.3, 0.7, scanLine);

    // Flicker — multiple frequency glitches
    float flickerNoise =
      step(0.98, fract(uTime * 7.3)) * 0.5 +
      step(0.99, fract(uTime * 13.7)) * 0.3 +
      sin(uTime * 50.0 + vWorldPos.y * 100.0) * 0.05;
    float flicker = 1.0 - uFlickerAmount * flickerNoise;

    // Base color + scan + fresnel
    float brightness = scanLine * 0.4 + fresnel * 0.9;
    vec3 color = uHologramColor * brightness;
    float alpha = (scanLine * 0.3 + fresnel * 0.9) * uOpacity * flicker;

    gl_FragColor = vec4(color, alpha);
  }
`

export const holographicTreatment: TreatmentDef = {
  id: 'holographic',
  name: 'Holographic',
  description: 'Sci-fi scan lines with fresnel glow',
  supportedViewers: ['mesh'],
  controls,
  getDefaultValues: () => ({
    scanLineDensity: 80,
    scanSpeed: 1.5,
    fresnelIntensity: 2.5,
    hologramColor: '#00e5ff',
    flickerAmount: 0.15,
    opacity: 0.6,
  }),
  meshVertexShader: vertexShader,
  meshFragmentShader: fragmentShader,
  buildUniforms(values: TreatmentValues) {
    return {
      uTime: { value: 0 },
      uScanLineDensity: { value: Number(values.scanLineDensity) },
      uScanSpeed: { value: Number(values.scanSpeed) },
      uFresnelIntensity: { value: Number(values.fresnelIntensity) },
      uHologramColor: { value: new THREE.Color(String(values.hologramColor)) },
      uFlickerAmount: { value: Number(values.flickerAmount) },
      uOpacity: { value: Number(values.opacity) },
    }
  },
  materialOptions: {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  },
  needsMeshGeometry: true,
  needsSampledPoints: false,
}
