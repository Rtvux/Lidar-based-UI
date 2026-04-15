import * as THREE from 'three'
import type { TreatmentDef, TreatmentValues, UniformExtras, TreatmentControlDef } from './index'

const controls: TreatmentControlDef[] = [
  { key: 'wireThickness', label: 'Wire Thickness', type: 'slider', min: 0.5, max: 5, step: 0.1, defaultValue: 1.5 },
  { key: 'wireColor', label: 'Wire Color', type: 'color', defaultColor: '#88ccff' },
  { key: 'fillOpacity', label: 'Fill Opacity', type: 'slider', min: 0, max: 0.5, step: 0.01, defaultValue: 0.05 },
  { key: 'depthFade', label: 'Depth Fade', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.6 },
  { key: 'edgeBrightness', label: 'Edge Brightness', type: 'slider', min: 0, max: 3, step: 0.1, defaultValue: 1.5 },
]

// Uses standard derivatives (fwidth) for anti-aliased wireframe on triangle edges.
// We use barycentric-like technique with gl_FragCoord and vertex shader pass-through.
const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDepth;
  varying vec3 vBary;
  attribute vec3 aBarycentric;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    vDepth = -mvPos.z;
    vBary = aBarycentric;
    gl_Position = projectionMatrix * mvPos;
  }
`

const fragmentShader = `
  uniform float uWireThickness;
  uniform vec3 uWireColor;
  uniform float uFillOpacity;
  uniform float uDepthFade;
  uniform float uEdgeBrightness;
  uniform float uSceneSize;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDepth;
  varying vec3 vBary;

  // Anti-aliased wireframe using barycentric coords
  float edgeFactor() {
    vec3 d = fwidth(vBary);
    vec3 a3 = smoothstep(vec3(0.0), d * uWireThickness, vBary);
    return min(min(a3.x, a3.y), a3.z);
  }

  void main() {
    float edge = 1.0 - edgeFactor();
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), uEdgeBrightness);

    // Depth fade: further = dimmer
    float normalizedDepth = clamp(vDepth / (uSceneSize * 3.0), 0.0, 1.0);
    float depthDim = 1.0 - normalizedDepth * uDepthFade;

    vec3 color = uWireColor * (edge * 1.0 + fresnel * 0.6);
    float alpha = edge * 0.95 + uFillOpacity * depthDim + fresnel * 0.3;
    alpha *= depthDim;

    gl_FragColor = vec4(color, alpha);
  }
`

export const xrayTreatment: TreatmentDef = {
  id: 'xray',
  name: 'X-Ray',
  description: 'Wireframe with depth-based transparency',
  supportedViewers: ['mesh'],
  controls,
  getDefaultValues: () => ({
    wireThickness: 1.5,
    wireColor: '#88ccff',
    fillOpacity: 0.05,
    depthFade: 0.6,
    edgeBrightness: 1.5,
  }),
  meshVertexShader: vertexShader,
  meshFragmentShader: fragmentShader,
  buildUniforms(values: TreatmentValues, extras: UniformExtras) {
    const bbox = extras.boundingBox
    const sceneSize = bbox
      ? Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z)
      : 1
    return {
      uWireThickness: { value: Number(values.wireThickness) },
      uWireColor: { value: new THREE.Color(String(values.wireColor)) },
      uFillOpacity: { value: Number(values.fillOpacity) },
      uDepthFade: { value: Number(values.depthFade) },
      uEdgeBrightness: { value: Number(values.edgeBrightness) },
      uSceneSize: { value: sceneSize },
    }
  },
  materialOptions: {
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  },
  needsMeshGeometry: true,
  needsSampledPoints: false,
}
