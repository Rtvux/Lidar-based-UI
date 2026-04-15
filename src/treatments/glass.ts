import * as THREE from 'three'
import type { TreatmentDef, TreatmentValues, TreatmentControlDef } from './index'

const controls: TreatmentControlDef[] = [
  { key: 'refractionStrength', label: 'Refraction Strength', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.3 },
  { key: 'tintColor', label: 'Tint Color', type: 'color', defaultColor: '#a5d8ff' },
  { key: 'transparency', label: 'Transparency', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.7 },
  { key: 'roughness', label: 'Roughness', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.15 },
  { key: 'iridescence', label: 'Iridescence', type: 'toggle', defaultEnabled: false },
]

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying vec3 vReflect;

  void main() {
    vec3 worldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 viewDirection = normalize(cameraPosition - worldPos);

    vNormal = worldNormal;
    vViewDir = viewDirection;
    vWorldPos = worldPos;
    vReflect = reflect(-viewDirection, worldNormal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform vec3 uTintColor;
  uniform float uRefractionStrength;
  uniform float uTransparency;
  uniform float uRoughness;
  uniform float uIridescence;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vReflect;

  void main() {
    // Fresnel: more opaque at edges, transparent face-on
    float fresnel = pow(1.0 - max(dot(vViewDir, vNormal), 0.0), 3.0);

    // Fake specular: multiple light directions for glassy highlights
    vec3 lightDir1 = normalize(vec3(1.0, 1.5, 1.0));
    vec3 lightDir2 = normalize(vec3(-0.8, 0.5, -0.5));
    float specExp = mix(8.0, 256.0, 1.0 - uRoughness);
    float spec1 = pow(max(dot(vReflect, lightDir1), 0.0), specExp);
    float spec2 = pow(max(dot(vReflect, lightDir2), 0.0), specExp) * 0.5;
    float spec = (spec1 + spec2) * (1.0 - uRoughness * 0.7);

    // Iridescence: rainbow thin-film interference
    vec3 iridColor = vec3(0.0);
    if (uIridescence > 0.5) {
      float angle = dot(vNormal, vViewDir);
      iridColor = vec3(
        sin(angle * 12.0) * 0.5 + 0.5,
        sin(angle * 12.0 + 2.094) * 0.5 + 0.5,
        sin(angle * 12.0 + 4.189) * 0.5 + 0.5
      ) * fresnel * 0.4;
    }

    vec3 baseColor = uTintColor + iridColor;
    vec3 color = baseColor * (0.6 + fresnel * 0.4) + vec3(spec);

    float alpha = mix(1.0 - uTransparency, 1.0, fresnel * 0.8) + spec * 0.4;
    alpha += uRefractionStrength * fresnel * 0.2;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(color, alpha);
  }
`

export const glassTreatment: TreatmentDef = {
  id: 'glass',
  name: 'Glass',
  description: 'Tinted glass with fresnel and specular',
  supportedViewers: ['mesh'],
  controls,
  getDefaultValues: () => ({
    refractionStrength: 0.3,
    tintColor: '#a5d8ff',
    transparency: 0.7,
    roughness: 0.15,
    iridescence: false,
  }),
  meshVertexShader: vertexShader,
  meshFragmentShader: fragmentShader,
  buildUniforms(values: TreatmentValues) {
    return {
      uRefractionStrength: { value: Number(values.refractionStrength) },
      uTintColor: { value: new THREE.Color(String(values.tintColor)) },
      uTransparency: { value: Number(values.transparency) },
      uRoughness: { value: Number(values.roughness) },
      uIridescence: { value: values.iridescence ? 1.0 : 0.0 },
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
