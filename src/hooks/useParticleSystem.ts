import { useMemo } from 'react'
import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

/**
 * Build a simple humanoid body from merged primitive geometries.
 * This is a placeholder until we have a real GLB model.
 */
function createHumanoidGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = []

  // Torso — single capsule, wider at top for shoulders
  const torso = new THREE.CapsuleGeometry(0.18, 0.5, 8, 16)
  torso.scale(1.15, 1.0, 0.85)
  torso.translate(0, 0.05, 0)
  geometries.push(torso)

  // Head
  const head = new THREE.SphereGeometry(0.14, 16, 12)
  head.translate(0, 0.62, 0)
  geometries.push(head)

  // Neck (thin, smooth connection)
  const neck = new THREE.CylinderGeometry(0.055, 0.07, 0.08, 8)
  neck.translate(0, 0.48, 0)
  geometries.push(neck)

  // Left arm — more natural angle, connected at shoulder
  const leftUpperArm = new THREE.CapsuleGeometry(0.06, 0.3, 6, 8)
  leftUpperArm.rotateZ(Math.PI * 0.38)
  leftUpperArm.translate(-0.4, 0.22, 0)
  geometries.push(leftUpperArm)

  const leftForearm = new THREE.CapsuleGeometry(0.05, 0.28, 6, 8)
  leftForearm.rotateZ(Math.PI * 0.35)
  leftForearm.translate(-0.62, 0.05, 0)
  geometries.push(leftForearm)

  // Right arm
  const rightUpperArm = new THREE.CapsuleGeometry(0.06, 0.3, 6, 8)
  rightUpperArm.rotateZ(-Math.PI * 0.38)
  rightUpperArm.translate(0.4, 0.22, 0)
  geometries.push(rightUpperArm)

  const rightForearm = new THREE.CapsuleGeometry(0.05, 0.28, 6, 8)
  rightForearm.rotateZ(-Math.PI * 0.35)
  rightForearm.translate(0.62, 0.05, 0)
  geometries.push(rightForearm)

  // Left leg — attach directly to torso bottom
  const leftUpperLeg = new THREE.CapsuleGeometry(0.08, 0.42, 6, 8)
  leftUpperLeg.translate(-0.1, -0.58, 0)
  geometries.push(leftUpperLeg)

  const leftLowerLeg = new THREE.CapsuleGeometry(0.055, 0.42, 6, 8)
  leftLowerLeg.translate(-0.1, -1.12, 0)
  geometries.push(leftLowerLeg)

  // Right leg
  const rightUpperLeg = new THREE.CapsuleGeometry(0.08, 0.42, 6, 8)
  rightUpperLeg.translate(0.1, -0.58, 0)
  geometries.push(rightUpperLeg)

  const rightLowerLeg = new THREE.CapsuleGeometry(0.055, 0.42, 6, 8)
  rightLowerLeg.translate(0.1, -1.12, 0)
  geometries.push(rightLowerLeg)

  // Merge all geometries
  const merged = mergeGeometries(geometries)
  geometries.forEach((g) => g.dispose())
  return merged
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Ensure all geometries have normals
  for (const geom of geometries) {
    if (!geom.getAttribute('normal')) {
      geom.computeVertexNormals()
    }
  }

  let totalVertices = 0
  let totalIndices = 0
  for (const geom of geometries) {
    totalVertices += geom.getAttribute('position').count
    totalIndices += geom.index ? geom.index.count : geom.getAttribute('position').count
  }

  const positions = new Float32Array(totalVertices * 3)
  const normals = new Float32Array(totalVertices * 3)
  const indices: number[] = []

  let vertexOffset = 0
  let indexOffset = 0

  for (const geom of geometries) {
    const pos = geom.getAttribute('position')
    const norm = geom.getAttribute('normal')

    for (let i = 0; i < pos.count; i++) {
      positions[(vertexOffset + i) * 3] = pos.getX(i)
      positions[(vertexOffset + i) * 3 + 1] = pos.getY(i)
      positions[(vertexOffset + i) * 3 + 2] = pos.getZ(i)
      normals[(vertexOffset + i) * 3] = norm.getX(i)
      normals[(vertexOffset + i) * 3 + 1] = norm.getY(i)
      normals[(vertexOffset + i) * 3 + 2] = norm.getZ(i)
    }

    if (geom.index) {
      for (let i = 0; i < geom.index.count; i++) {
        indices[indexOffset + i] = geom.index.getX(i) + vertexOffset
      }
      indexOffset += geom.index.count
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[indexOffset + i] = vertexOffset + i
      }
      indexOffset += pos.count
    }

    vertexOffset += pos.count
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  merged.setIndex(indices)
  return merged
}

export interface ParticleData {
  geometry: THREE.BufferGeometry
  count: number
}

export function useParticleSystem(particleCount = 80000): ParticleData {
  const data = useMemo(() => {
    // Create the humanoid mesh for sampling
    const bodyGeometry = createHumanoidGeometry()
    const material = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(bodyGeometry, material)

    // Sample particles from the surface
    const sampler = new MeshSurfaceSampler(mesh).setWeightAttribute(null).build()

    const positions = new Float32Array(particleCount * 3)
    const normals = new Float32Array(particleCount * 3)
    const randoms = new Float32Array(particleCount)

    const tempPosition = new THREE.Vector3()
    const tempNormal = new THREE.Vector3()

    for (let i = 0; i < particleCount; i++) {
      sampler.sample(tempPosition, tempNormal)

      positions[i * 3] = tempPosition.x
      positions[i * 3 + 1] = tempPosition.y
      positions[i * 3 + 2] = tempPosition.z

      normals[i * 3] = tempNormal.x
      normals[i * 3 + 1] = tempNormal.y
      normals[i * 3 + 2] = tempNormal.z

      randoms[i] = Math.random()
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aNormal', new THREE.BufferAttribute(normals, 3))
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

    // Clean up
    bodyGeometry.dispose()
    material.dispose()

    return { geometry, count: particleCount }
  }, [particleCount])

  return data
}
