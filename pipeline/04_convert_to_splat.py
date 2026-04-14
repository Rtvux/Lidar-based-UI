#!/usr/bin/env python3
"""
Step 4: Convert .ply Gaussian Splatting output to .splat format for browser.

Usage:
    python 04_convert_to_splat.py input.ply --output output.splat

The .splat format is a compact binary format optimized for web rendering.
Each Gaussian is stored as 32 bytes:
    - position: 3x float32 (12 bytes)
    - scale: 3x float16 (6 bytes) — log scale
    - color: 4x uint8 (4 bytes) — RGBA
    - rotation: 4x uint8 (4 bytes) — quaternion, normalized
    - padding: 6 bytes

Total: 32 bytes per Gaussian (vs ~244 bytes in PLY with full SH)
"""

import argparse
import struct
import sys
from pathlib import Path

import numpy as np


def sigmoid(x):
    return 1 / (1 + np.exp(-x))


def read_ply(path: str) -> dict:
    """Read a Gaussian Splatting PLY file."""
    with open(path, "rb") as f:
        # Parse header
        header_lines = []
        while True:
            line = f.readline().decode("utf-8").strip()
            header_lines.append(line)
            if line == "end_header":
                break

        # Extract vertex count and properties
        vertex_count = 0
        properties = []
        for line in header_lines:
            if line.startswith("element vertex"):
                vertex_count = int(line.split()[-1])
            elif line.startswith("property"):
                parts = line.split()
                dtype = parts[1]
                name = parts[2]
                properties.append((name, dtype))

        print(f"  Vertices: {vertex_count:,}")
        print(f"  Properties: {len(properties)}")

        # Map PLY types to numpy types
        type_map = {
            "float": np.float32,
            "double": np.float64,
            "uchar": np.uint8,
            "int": np.int32,
        }

        # Build numpy dtype
        np_dtype = [(name, type_map.get(dtype, np.float32)) for name, dtype in properties]
        data = np.frombuffer(f.read(), dtype=np_dtype, count=vertex_count)

    return data, properties


def ply_to_splat(ply_path: str, splat_path: str):
    """Convert PLY Gaussian Splatting to .splat format."""
    print(f"Reading PLY: {ply_path}")
    data, properties = read_ply(ply_path)
    prop_names = [p[0] for p in properties]

    n = len(data)
    print(f"  Converting {n:,} Gaussians to .splat format...")

    # Extract positions
    x = data["x"].astype(np.float32)
    y = data["y"].astype(np.float32)
    z = data["z"].astype(np.float32)

    # Extract scales (stored as log scale in PLY)
    if "scale_0" in prop_names:
        sx = np.exp(data["scale_0"].astype(np.float32))
        sy = np.exp(data["scale_1"].astype(np.float32))
        sz = np.exp(data["scale_2"].astype(np.float32))
    else:
        sx = sy = sz = np.ones(n, dtype=np.float32) * 0.01

    # Extract rotation quaternions
    if "rot_0" in prop_names:
        qw = data["rot_0"].astype(np.float32)
        qx = data["rot_1"].astype(np.float32)
        qy = data["rot_2"].astype(np.float32)
        qz = data["rot_3"].astype(np.float32)
        # Normalize
        norm = np.sqrt(qw**2 + qx**2 + qy**2 + qz**2)
        qw /= norm; qx /= norm; qy /= norm; qz /= norm
    else:
        qw = np.ones(n, dtype=np.float32)
        qx = qy = qz = np.zeros(n, dtype=np.float32)

    # Extract color (from spherical harmonics DC component or direct RGB)
    if "f_dc_0" in prop_names:
        # SH DC component to RGB: color = 0.5 + C0 * sh_dc
        C0 = 0.28209479177387814  # 1 / (2 * sqrt(pi))
        r = np.clip((0.5 + C0 * data["f_dc_0"].astype(np.float32)) * 255, 0, 255).astype(np.uint8)
        g = np.clip((0.5 + C0 * data["f_dc_1"].astype(np.float32)) * 255, 0, 255).astype(np.uint8)
        b = np.clip((0.5 + C0 * data["f_dc_2"].astype(np.float32)) * 255, 0, 255).astype(np.uint8)
    elif "red" in prop_names:
        r = data["red"].astype(np.uint8)
        g = data["green"].astype(np.uint8)
        b = data["blue"].astype(np.uint8)
    else:
        r = g = b = np.full(n, 128, dtype=np.uint8)

    # Extract opacity
    if "opacity" in prop_names:
        opacity = data["opacity"].astype(np.float32)
        alpha = np.clip(sigmoid(opacity) * 255, 0, 255).astype(np.uint8)
    else:
        alpha = np.full(n, 255, dtype=np.uint8)

    # Sort by scale (largest first) for better rendering
    scales_sum = sx + sy + sz
    sort_idx = np.argsort(-scales_sum)

    # Build .splat binary buffer
    # Format per Gaussian: 3x float32 pos + 3x float32 scale + 4x uint8 color + 4x uint8 rotation = 32 bytes
    buffer = bytearray(n * 32)

    for i, idx in enumerate(sort_idx):
        offset = i * 32

        # Position (3x float32 = 12 bytes)
        struct.pack_into("fff", buffer, offset, x[idx], y[idx], z[idx])

        # Scale (3x float32 = 12 bytes)
        struct.pack_into("fff", buffer, offset + 12, sx[idx], sy[idx], sz[idx])

        # Color RGBA (4x uint8 = 4 bytes)
        struct.pack_into("BBBB", buffer, offset + 24, r[idx], g[idx], b[idx], alpha[idx])

        # Rotation quaternion (4x uint8 = 4 bytes, mapped from [-1,1] to [0,255])
        rw = np.clip(((qw[idx] + 1) / 2) * 255, 0, 255).astype(np.uint8)
        rx = np.clip(((qx[idx] + 1) / 2) * 255, 0, 255).astype(np.uint8)
        ry = np.clip(((qy[idx] + 1) / 2) * 255, 0, 255).astype(np.uint8)
        rz = np.clip(((qz[idx] + 1) / 2) * 255, 0, 255).astype(np.uint8)
        struct.pack_into("BBBB", buffer, offset + 28, rw, rx, ry, rz)

    # Write .splat file
    with open(splat_path, "wb") as f:
        f.write(buffer)

    size_mb = len(buffer) / (1024 * 1024)
    print(f"\n  Output: {splat_path} ({size_mb:.1f} MB)")
    print(f"  Gaussians: {n:,}")
    print(f"  Compression: {32} bytes/gaussian")


def main():
    parser = argparse.ArgumentParser(description="Convert .ply to .splat for browser viewing")
    parser.add_argument("input", help="Input .ply file from Gaussian Splatting training")
    parser.add_argument("--output", "-o", help="Output .splat file (default: same name with .splat extension)")
    args = parser.parse_args()

    if not Path(args.input).exists():
        print(f"Error: Input file not found: {args.input}")
        sys.exit(1)

    output = args.output or str(Path(args.input).with_suffix(".splat"))

    ply_to_splat(args.input, output)

    print(f"\nDone! Now open http://localhost:5173 and drag-drop {output}")


if __name__ == "__main__":
    main()
