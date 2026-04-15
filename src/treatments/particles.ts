import * as THREE from 'three'
import type { TreatmentDef, TreatmentValues, UniformExtras, TreatmentControlDef } from './index'

const controls: TreatmentControlDef[] = [
  { key: 'particleSize', label: 'Particle Size', type: 'slider', min: 1, max: 50, step: 1, defaultValue: 6 },
  { key: 'particleColor', label: 'Color', type: 'color', defaultColor: '#7dd3fc' },
  { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.4 },
  { key: 'breathSpeed', label: 'Breathing Speed', type: 'slider', min: 0, max: 3, step: 0.1, defaultValue: 1.0 },
  { key: 'breathIntensity', label: 'Breathing Intensity', type: 'slider', min: 0, max: 0.02, step: 0.001, defaultValue: 0.002 },
]

const vertexShader = `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uBreathSpeed;
  uniform float uBreathIntensity;
  attribute float aRandom;
  attribute vec3 aNormal;
  varying float vRandom;

  void main() {
    vRandom = aRandom;

    float breathPhase = uTime * uBreathSpeed + aRandom * 6.2831;
    float breathAmount = sin(breathPhase) * uBreathIntensity;

    vec3 n = length(aNormal) > 0.001 ? aNormal : normalize(position);
    vec3 displaced = position + n * breathAmount;

    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float sizeVariation = 0.7 + 0.5 * aRandom;
    gl_PointSize = uSize * sizeVariation * uPixelRatio * (1.0 / -mvPos.z);
    gl_PointSize = clamp(gl_PointSize, 0.5, 50.0);
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uBreathSpeed;
  varying float vRandom;

  void main() {
    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.45) discard;
    float dot = smoothstep(0.45, 0.25, dist);
    float pulse = 0.95 + 0.05 * sin(uTime * uBreathSpeed + vRandom * 6.2831);
    gl_FragColor = vec4(uColor, dot * uOpacity * pulse);
  }
`

export const particlesTreatment: TreatmentDef = {
  id: 'particles',
  name: 'Particles',
  description: 'Clean dot particles on the surface',
  supportedViewers: ['mesh', 'pointcloud'],
  controls,
  getDefaultValues: () => ({
    particleSize: 6,
    particleColor: '#7dd3fc',
    opacity: 0.4,
    breathSpeed: 1.0,
    breathIntensity: 0.002,
  }),
  pointsVertexShader: vertexShader,
  pointsFragmentShader: fragmentShader,
  buildUniforms(values: TreatmentValues, extras: UniformExtras) {
    return {
      uTime: { value: 0 },
      uSize: { value: Number(values.particleSize) },
      uPixelRatio: { value: extras.pixelRatio },
      uColor: { value: new THREE.Color(String(values.particleColor)) },
      uOpacity: { value: Number(values.opacity) },
      uBreathSpeed: { value: Number(values.breathSpeed) },
      uBreathIntensity: { value: Number(values.breathIntensity) },
    }
  },
  materialOptions: {
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  },
  needsMeshGeometry: false,
  needsSampledPoints: true,
}
