#!/usr/bin/env python3
"""
Step 3: Train 3D Gaussian Splatting from COLMAP output.

Usage:
    # Using nerfstudio (recommended, works on Mac with MPS)
    python 03_train_splat.py ./frames --colmap ./colmap_output/sparse/0 --method nerfstudio

    # Using OpenSplat (native Mac Metal support)
    python 03_train_splat.py ./frames --colmap ./colmap_output/sparse/0 --method opensplat

    # Using original INRIA implementation (NVIDIA GPU required)
    python 03_train_splat.py ./frames --colmap ./colmap_output/sparse/0 --method inria

What it does:
    - Takes COLMAP sparse reconstruction + original images
    - Trains 3D Gaussian Splatting model
    - Exports .ply file (which can be converted to .splat for browser)

Output:
    output/
    ├── point_cloud.ply    ← trained Gaussian Splatting model
    └── cameras.json       ← camera parameters
"""

import argparse
import subprocess
import sys
import shutil
from pathlib import Path


def check_tool(name: str) -> bool:
    """Check if a command-line tool is available."""
    return shutil.which(name) is not None


def prepare_nerfstudio_data(image_dir: str, colmap_sparse: str, output_dir: str) -> str:
    """
    Prepare data in nerfstudio-compatible format.
    Nerfstudio expects: images/ + colmap/sparse/0/{cameras,images,points3D}.bin
    """
    data_dir = Path(output_dir) / "ns_data"
    data_dir.mkdir(parents=True, exist_ok=True)

    # Symlink images
    img_link = data_dir / "images"
    if not img_link.exists():
        img_link.symlink_to(Path(image_dir).resolve())

    # Copy COLMAP output
    colmap_dir = data_dir / "colmap" / "sparse" / "0"
    colmap_dir.mkdir(parents=True, exist_ok=True)
    for f in Path(colmap_sparse).glob("*"):
        dest = colmap_dir / f.name
        if not dest.exists():
            shutil.copy2(f, dest)

    return str(data_dir)


def train_nerfstudio(image_dir: str, colmap_sparse: str, output_dir: str, steps: int):
    """Train using nerfstudio's splatfacto method."""
    print("\n=== Training with Nerfstudio (splatfacto) ===\n")

    # Check if nerfstudio is installed
    try:
        subprocess.run(["ns-train", "--help"], capture_output=True, check=True)
    except FileNotFoundError:
        print("Error: nerfstudio not found!")
        print("\nInstall:")
        print("  pip install nerfstudio")
        print("  # On Mac, also need: pip install gsplat")
        sys.exit(1)

    # Prepare data directory
    data_dir = prepare_nerfstudio_data(image_dir, colmap_sparse, output_dir)

    # Detect device
    import platform
    is_mac = platform.system() == "Darwin"

    cmd = ["ns-train", "splatfacto", "--data", data_dir]

    if is_mac:
        # Apple Silicon MPS settings
        cmd.extend([
            "--machine.device-type", "mps",
            "--mixed-precision", "False",
        ])
        # Set MPS fallback env var
        import os
        os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

    cmd.extend(["--max-num-iterations", str(steps)])
    cmd.extend(["--output-dir", output_dir])

    print(f"Running: {' '.join(cmd)}")
    print(f"This will take ~{steps // 100} minutes on GPU, longer on Mac...\n")

    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("Training failed!")
        sys.exit(1)

    print("\nTraining complete!")
    print(f"\nTo export .ply file:")
    print(f"  ns-export gaussian-splat \\")
    print(f"    --load-config {output_dir}/splatfacto/*/config.yml \\")
    print(f"    --output-dir {output_dir}/export")


def train_opensplat(image_dir: str, colmap_sparse: str, output_dir: str, steps: int):
    """Train using OpenSplat (native Mac Metal support)."""
    print("\n=== Training with OpenSplat ===\n")

    if not check_tool("opensplat"):
        print("Error: opensplat not found!")
        print("\nInstall OpenSplat:")
        print("  # macOS (from source):")
        print("  git clone https://github.com/pierotofy/OpenSplat.git")
        print("  cd OpenSplat && mkdir build && cd build")
        print("  cmake -DCMAKE_BUILD_TYPE=Release ..")
        print("  make -j$(sysctl -n hw.ncpu)")
        print("  # Binary will be at build/opensplat")
        sys.exit(1)

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # OpenSplat expects: path with images/ and sparse/0/ from COLMAP
    # Create the expected directory structure
    work_dir = out / "opensplat_workspace"
    work_dir.mkdir(parents=True, exist_ok=True)

    img_link = work_dir / "images"
    if not img_link.exists():
        img_link.symlink_to(Path(image_dir).resolve())

    sparse_link = work_dir / "sparse" / "0"
    sparse_link.mkdir(parents=True, exist_ok=True)
    for f in Path(colmap_sparse).glob("*"):
        dest = sparse_link / f.name
        if not dest.exists():
            shutil.copy2(f, dest)

    cmd = [
        "opensplat", str(work_dir),
        "--output", str(out / "point_cloud.ply"),
        "--num-iters", str(steps),
    ]

    print(f"Running: {' '.join(cmd)}")
    print(f"This will take ~{steps // 150} minutes on M-series Mac...\n")

    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("Training failed!")
        sys.exit(1)

    ply_path = out / "point_cloud.ply"
    if ply_path.exists():
        size_mb = ply_path.stat().st_size / (1024 * 1024)
        print(f"\nTraining complete! Output: {ply_path} ({size_mb:.1f} MB)")
    else:
        print("Warning: Expected output file not found")


def train_inria(image_dir: str, colmap_sparse: str, output_dir: str, steps: int):
    """Train using original INRIA 3D Gaussian Splatting (requires NVIDIA GPU)."""
    print("\n=== Training with INRIA 3D Gaussian Splatting ===\n")

    # Check for CUDA
    try:
        result = subprocess.run(["nvidia-smi"], capture_output=True, text=True)
        if result.returncode != 0:
            raise FileNotFoundError
    except FileNotFoundError:
        print("Error: NVIDIA GPU not detected!")
        print("The INRIA method requires CUDA. On Mac, use --method nerfstudio or --method opensplat")
        sys.exit(1)

    # Expect the 3DGS repo to be cloned
    gs_path = Path.home() / "gaussian-splatting"
    train_script = gs_path / "train.py"

    if not train_script.exists():
        print("Error: INRIA gaussian-splatting repo not found!")
        print(f"\nExpected at: {gs_path}")
        print("\nSetup:")
        print("  git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting.git ~/gaussian-splatting")
        print("  cd ~/gaussian-splatting && pip install -e .")
        sys.exit(1)

    # INRIA expects specific directory structure
    work_dir = Path(output_dir) / "inria_workspace"
    work_dir.mkdir(parents=True, exist_ok=True)

    img_link = work_dir / "images"
    if not img_link.exists():
        img_link.symlink_to(Path(image_dir).resolve())

    sparse_dir = work_dir / "sparse" / "0"
    sparse_dir.mkdir(parents=True, exist_ok=True)
    for f in Path(colmap_sparse).glob("*"):
        dest = sparse_dir / f.name
        if not dest.exists():
            shutil.copy2(f, dest)

    cmd = [
        sys.executable, str(train_script),
        "-s", str(work_dir),
        "--iterations", str(steps),
        "-m", str(Path(output_dir) / "trained_model"),
    ]

    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("Training failed!")
        sys.exit(1)

    print(f"\nTraining complete! Model saved to {output_dir}/trained_model/")


def main():
    parser = argparse.ArgumentParser(description="Train 3D Gaussian Splatting")
    parser.add_argument("images", help="Path to image directory")
    parser.add_argument("--colmap", required=True, help="Path to COLMAP sparse reconstruction (e.g., colmap_output/sparse/0)")
    parser.add_argument("--output", "-o", default="./gs_output", help="Output directory")
    parser.add_argument("--method", choices=["nerfstudio", "opensplat", "inria"], default="nerfstudio",
                        help="Training method (default: nerfstudio)")
    parser.add_argument("--steps", type=int, default=2000,
                        help="Training iterations (default: 2000, use 7000-30000 for high quality)")
    args = parser.parse_args()

    if not Path(args.images).exists():
        print(f"Error: Image directory not found: {args.images}")
        sys.exit(1)

    if not Path(args.colmap).exists():
        print(f"Error: COLMAP output not found: {args.colmap}")
        sys.exit(1)

    methods = {
        "nerfstudio": train_nerfstudio,
        "opensplat": train_opensplat,
        "inria": train_inria,
    }

    methods[args.method](args.images, args.colmap, args.output, args.steps)

    print(f"\n{'='*50}")
    print("Next steps:")
    print(f"  1. Convert to .splat: python 04_convert_to_splat.py {args.output}/point_cloud.ply")
    print(f"  2. Open http://localhost:5173 and drag-drop the .splat file")


if __name__ == "__main__":
    main()
