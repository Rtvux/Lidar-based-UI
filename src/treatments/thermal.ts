import * as THREE from 'three'
import type { TreatmentDef, TreatmentValues, UniformExtras, TreatmentControlDef } from './index'
import { THERMAL_GRADIENT_GLSL } from './shaderLib'

const controls: TreatmentControlDef[] = [
  { key: 'startColor', label: 'Start Color', type: 'color', defaultColor: '#0000ff' },
  { key: 'endColor', label: 'End Color', type: 'color', defaultColor: '#ff0000' },
  {
    key: 'axis',
    label: 'Gradient Axis',
    type: 'select',
    options: [
      { label: 'X', value: 'x' },
      { label: 'Y', value: 'y' },
      { label: 'Z', value: 'z' },
    ],
    defaultOption: 'y',
  },
  { key: 'scanSpeed', label: 'Scan Speed', type: 'slider', min: 0, max: 3, step: 0.1, defaultValue: 0.5 },
  { key: 'contrast', label: 'Contrast', type: 'slider', min: 0.5, max: 3, step: 0.1, defaultValue: 1.0 },
  { key: 'useClassic', label: 'Classic Thermal Palette', type: 'toggle', defaultEnabled: false },
]

const meshVertexShader = `
  uniform int uAxis;
  uniform float uBoundsMin;
  uniform float uBoundsMax;
  varying float vGradientT;
  varying vec3 vNormal;

  void main() {
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    float axisVal = uAxis == 0 ? worldPos.x : (uAxis == 1 ? worldPos.y : worldPos.z);
    vGradientT = (axisVal - uBoundsMin) / max(uBoundsMax - uBoundsMin, 0.0001);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const meshFragmentShader = `
  ${THERMAL_GRADIENT_GLSL}

  uniform float uTime;
  uniform vec3 uStartColor;
  uniform vec3 uEndColor;
  uniform float uScanSpeed;
  uniform float uContrast;
  uniform float uUseClassic;

  varying float vGradientT;
  varying vec3 vNormal;

  void main() {
    float t = clamp(pow(vGradientT, uContrast), 0.0, 1.0);

    // Two palette options
    vec3 gradColor = uUseClassic > 0.5
      ? thermalGradient(t)
      : mix(uStartColor, uEndColor, t);

    // Animated scan band
    float scanPos = fract(uTime * uScanSpeed);
    float scanBand = exp(-pow((t - scanPos) * 15.0, 2.0)) * 0.6;

    // Very subtle shading based on normal
    float shading = 0.85 + 0.15 * max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0);

    vec3 color = gradColor * shading + vec3(scanBand);
    gl_FragColor = vec4(color, 1.0);
  }
`

const pointsVertexShader = `
  uniform int uAxis;
  uniform float uBoundsMin;
  uniform float uBoundsMax;
  uniform float uPixelRatio;
  attribute float aRandom;
  varying float vGradientT;
  varying float vRandom;

  void main() {
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    float axisVal = uAxis == 0 ? worldPos.x : (uAxis == 1 ? worldPos.y : worldPos.z);
    vGradientT = (axisVal - uBoundsMin) / max(uBoundsMax - uBoundsMin, 0.0001);
    vRandom = aRandom;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = 3.0 * uPixelRatio * (1.0 / -mvPos.z) * (200.0);
    gl_PointSize = clamp(gl_PointSize, 1.0, 8.0);
  }
`

const pointsFragmentShader = `
  ${THERMAL_GRADIENT_GLSL}

  uniform float uTime;
  uniform vec3 uStartColor;
  uniform vec3 uEndColor;
  uniform float uScanSpeed;
  uniform float uContrast;
  uniform float uUseClassic;

  varying float vGradientT;
  varying float vRandom;

  void main() {
    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.45) discard;

    float t = clamp(pow(vGradientT, uContrast), 0.0, 1.0);
    vec3 gradColor = uUseClassic > 0.5
      ? thermalGradient(t)
      : mix(uStartColor, uEndColor, t);

    float scanPos = fract(uTime * uScanSpeed);
    float scanBand = exp(-pow((t - scanPos) * 15.0, 2.0)) * 0.5;

    vec3 color = gradColor + vec3(scanBand);
    float alpha = smoothstep(0.45, 0.2, dist) * 0.95;
    gl_FragColor = vec4(color, alpha);
  }
`

export const thermalTreatment: TreatmentDef = {
  id: 'thermal',
  name: 'Thermal',
  description: 'Heat map gradient across the model',
  supportedViewers: ['mesh', 'pointcloud'],
  controls,
  getDefaultValues: () => ({
    startColor: '#0000ff',
    endColor: '#ff0000',
    axis: 'y',
    scanSpeed: 0.5,
    contrast: 1.0,
    useClassic: false,
  }),
  meshVertexShader,
  meshFragmentShader,
  pointsVertexShader,
  pointsFragmentShader,
  buildUniforms(values: TreatmentValues, extras: UniformExtras) {
    const axisStr = String(values.axis)
    const axisIdx = axisStr === 'x' ? 0 : axisStr === 'y' ? 1 : 2
    const bbox = extras.boundingBox
    const min = bbox
      ? (axisIdx === 0 ? bbox.min.x : axisIdx === 1 ? bbox.min.y : bbox.min.z)
      : -1
    const max = bbox
      ? (axisIdx === 0 ? bbox.max.x : axisIdx === 1 ? bbox.max.y : bbox.max.z)
      : 1

    return {
      uTime: { value: 0 },
      uAxis: { value: axisIdx },
      uBoundsMin: { value: min },
      uBoundsMax: { value: max },
      uStartColor: { value: new THREE.Color(String(values.startColor)) },
      uEndColor: { value: new THREE.Color(String(values.endColor)) },
      uScanSpeed: { value: Number(values.scanSpeed) },
      uContrast: { value: Number(values.contrast) },
      uUseClassic: { value: values.useClassic ? 1.0 : 0.0 },
      uPixelRatio: { value: extras.pixelRatio },
    }
  },
  materialOptions: {
    transparent: false,
    depthWrite: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  },
  needsMeshGeometry: true,
  needsSampledPoints: false,
}
