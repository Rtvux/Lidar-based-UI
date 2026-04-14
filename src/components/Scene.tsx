import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { ParticleBody } from './ParticleBody'

interface SceneProps {
  visible: boolean
}

/** Particle body scene — its own R3F Canvas, hidden when not active */
export function Scene({ visible }: SceneProps) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: visible ? 'block' : 'none',
    }}>
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 50 }}
        style={{ background: '#050510' }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        frameloop={visible ? 'always' : 'never'}
      >
        <ambientLight intensity={0.3} />
        <ParticleBody />
        <OrbitControls
          enablePan={false}
          minDistance={1.5}
          maxDistance={6}
          minPolarAngle={Math.PI * 0.15}
          maxPolarAngle={Math.PI * 0.85}
          autoRotate
          autoRotateSpeed={0.5}
          enableDamping
          dampingFactor={0.05}
        />
        <EffectComposer>
          <Bloom
            intensity={0.05}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
