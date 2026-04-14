import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useParticleSystem } from '../hooks/useParticleSystem'
import vertexShader from '../shaders/particle.vert.glsl'
import fragmentShader from '../shaders/particle.frag.glsl'

export function ParticleBody() {
  const { geometry } = useParticleSystem(30000)
  const materialRef = useRef<THREE.ShaderMaterial>(null!)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 15.0 },
      uBreathIntensity: { value: 0.003 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColorInner: { value: new THREE.Color('#7dd3fc') },
      uColorOuter: { value: new THREE.Color('#38bdf8') },
      uOpacity: { value: 0.7 },
    }),
    [],
  )

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta
    }
  })

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  )
}
