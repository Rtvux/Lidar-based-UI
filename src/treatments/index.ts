import * as THREE from 'three'
import { particlesTreatment } from './particles'
import { holographicTreatment } from './holographic'
import { xrayTreatment } from './xray'
import { dissolveTreatment } from './dissolve'
import { glassTreatment } from './glass'
import { thermalTreatment } from './thermal'

// ── Types ──

export type ControlType = 'slider' | 'color' | 'toggle' | 'select'

export interface SliderControl {
  key: string
  label: string
  type: 'slider'
  min: number
  max: number
  step: number
  defaultValue: number
}

export interface ColorControl {
  key: string
  label: string
  type: 'color'
  defaultColor: string
}

export interface ToggleControl {
  key: string
  label: string
  type: 'toggle'
  defaultEnabled: boolean
}

export interface SelectControl {
  key: string
  label: string
  type: 'select'
  options: { label: string; value: string }[]
  defaultOption: string
}

export type TreatmentControlDef = SliderControl | ColorControl | ToggleControl | SelectControl

export type TreatmentValues = Record<string, number | string | boolean>

export type ViewerType = 'mesh' | 'pointcloud'

export interface UniformExtras {
  pixelRatio: number
  boundingBox?: { min: THREE.Vector3; max: THREE.Vector3 }
}

export interface TreatmentDef {
  id: string
  name: string
  description: string
  supportedViewers: ViewerType[]
  controls: TreatmentControlDef[]
  getDefaultValues: () => TreatmentValues

  // Shader sources
  pointsVertexShader?: string
  pointsFragmentShader?: string
  meshVertexShader?: string
  meshFragmentShader?: string

  buildUniforms: (values: TreatmentValues, extras: UniformExtras) => Record<string, THREE.IUniform>

  materialOptions?: {
    transparent?: boolean
    depthWrite?: boolean
    blending?: THREE.Blending
    side?: THREE.Side
  }

  needsMeshGeometry: boolean
  needsSampledPoints: boolean
}

// ── Registry ──

export const TREATMENTS: Record<string, TreatmentDef> = {
  particles: particlesTreatment,
  holographic: holographicTreatment,
  xray: xrayTreatment,
  dissolve: dissolveTreatment,
  glass: glassTreatment,
  thermal: thermalTreatment,
}

export const TREATMENT_LIST = Object.values(TREATMENTS)

// ── Utilities ──

/**
 * Extract default values from a treatment's control definitions.
 */
export function getDefaultsFromControls(controls: TreatmentControlDef[]): TreatmentValues {
  const values: TreatmentValues = {}
  for (const c of controls) {
    if (c.type === 'slider') values[c.key] = c.defaultValue
    else if (c.type === 'color') values[c.key] = c.defaultColor
    else if (c.type === 'toggle') values[c.key] = c.defaultEnabled
    else if (c.type === 'select') values[c.key] = c.defaultOption
  }
  return values
}
