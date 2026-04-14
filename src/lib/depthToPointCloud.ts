/**
 * Convert a depth map + RGB image into a 3D point cloud.
 *
 * Uses pinhole camera back-projection:
 *   X =  (u - cx) * z / fx
 *   Y = -(v - cy) * z / fy   (flip: image Y-down → Three.js Y-up)
 *   Z = -z                     (Three.js looks down -Z)
 */

export interface PointCloudData {
  positions: Float32Array
  count: number
}

export function depthToPointCloud(
  depthData: Float32Array,   // depth values, row-major
  depthWidth: number,
  depthHeight: number,
  targetPoints: number = 250000,
): PointCloudData {
  // Estimate stride to hit target point count
  const totalPixels = depthWidth * depthHeight
  const stride = Math.max(1, Math.round(Math.sqrt(totalPixels / targetPoints)))

  const cols = Math.floor(depthWidth / stride)
  const rows = Math.floor(depthHeight / stride)
  const count = cols * rows

  const positions = new Float32Array(count * 3)

  // Estimated pinhole camera intrinsics
  const fx = Math.max(depthWidth, depthHeight)
  const fy = fx
  const cx = depthWidth / 2
  const cy = depthHeight / 2

  // Normalize depth to a reasonable range
  let minD = Infinity, maxD = -Infinity
  for (let i = 0; i < depthData.length; i++) {
    const d = depthData[i]
    if (d > 0 && isFinite(d)) {
      minD = Math.min(minD, d)
      maxD = Math.max(maxD, d)
    }
  }
  const depthRange = maxD - minD || 1
  // Scale depth to [0.2, 3.0] range for nice viewing distance
  const depthScale = 2.8 / depthRange
  const depthOffset = 0.2

  let idx = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = col * stride
      const v = row * stride
      const pixelIdx = v * depthWidth + u

      let z = depthData[pixelIdx]
      if (!isFinite(z) || z <= 0) z = maxD // fallback

      // Normalize and scale
      const zNorm = ((z - minD) * depthScale) + depthOffset

      // Back-project
      const x = (u - cx) * zNorm / fx
      const y = -(v - cy) * zNorm / fy
      const pz = -zNorm

      positions[idx * 3] = x
      positions[idx * 3 + 1] = y
      positions[idx * 3 + 2] = pz

      idx++
    }
  }

  return { positions, count }
}
