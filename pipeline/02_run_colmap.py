#!/usr/bin/env python3
"""
Step 2: Run COLMAP Structure-from-Motion on extracted frames.

Usage:
    python 02_run_colmap.py ./frames --output ./colmap_output

What it does:
    1. Feature extraction (finds keypoints in each image)
    2. Feature matching (matches keypoints across image pairs)
    3. Sparse reconstruction (triangulates 3D points + camera poses)

Output:
    colmap_output/
    ├── sparse/0/
    │   ├── cameras.bin    ← camera intrinsics (focal length, etc.)
    │   ├── images.bin     ← camera poses (where each photo was taken)
    │   └── points3D.bin   ← sparse 3D point cloud
    └── database.db        ← feature database
"""

import argparse
import subprocess
import sys
from pathlib import Path


def check_colmap():
    """Check if COLMAP is installed."""
    try:
        result = subprocess.run(["colmap", "--help"], capture_output=True, text=True)
        return result.returncode == 0
    except FileNotFoundError:
        return False


def run_colmap(image_dir: str, output_dir: str, quality: str = "medium"):
    """Run COLMAP automatic reconstruction pipeline."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    db_path = str(out / "database.db")
    sparse_path = str(out / "sparse")
    Path(sparse_path).mkdir(parents=True, exist_ok=True)

    # Quality presets
    quality_presets = {
        "low": {
            "SiftExtraction.max_num_features": "4096",
            "SiftExtraction.first_octave": "0",
        },
        "medium": {
            "SiftExtraction.max_num_features": "8192",
            "SiftExtraction.first_octave": "-1",
        },
        "high": {
            "SiftExtraction.max_num_features": "16384",
            "SiftExtraction.first_octave": "-1",
        },
    }
    preset = quality_presets.get(quality, quality_presets["medium"])

    # Step 1: Feature extraction
    print("\n[1/3] Extracting features...")
    cmd = [
        "colmap", "feature_extractor",
        "--database_path", db_path,
        "--image_path", image_dir,
        "--ImageReader.single_camera", "1",
        "--SiftExtraction.max_num_features", preset["SiftExtraction.max_num_features"],
        "--SiftExtraction.first_octave", preset["SiftExtraction.first_octave"],
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Feature extraction failed:\n{result.stderr}")
        sys.exit(1)
    print("  Features extracted successfully")

    # Step 2: Feature matching
    print("\n[2/3] Matching features across images...")

    # Count images to decide matching strategy
    image_count = len(list(Path(image_dir).glob("*.jpg"))) + len(list(Path(image_dir).glob("*.png")))

    if image_count < 100:
        # Exhaustive matching for small sets
        cmd = [
            "colmap", "exhaustive_matcher",
            "--database_path", db_path,
        ]
    else:
        # Sequential matching for large sets (assumes ordered frames)
        cmd = [
            "colmap", "sequential_matcher",
            "--database_path", db_path,
            "--SequentialMatching.overlap", "10",
            "--SequentialMatching.loop_detection", "1",
        ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Feature matching failed:\n{result.stderr}")
        sys.exit(1)
    print("  Matching completed successfully")

    # Step 3: Sparse reconstruction (mapper)
    print("\n[3/3] Running sparse reconstruction (this may take a few minutes)...")
    cmd = [
        "colmap", "mapper",
        "--database_path", db_path,
        "--image_path", image_dir,
        "--output_path", sparse_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Reconstruction failed:\n{result.stderr}")
        print("\nTroubleshooting tips:")
        print("  - Ensure images have >50% overlap between adjacent frames")
        print("  - Try more frames (increase fps in step 1)")
        print("  - Check that images aren't too blurry")
        sys.exit(1)

    # Check output
    sparse_model = Path(sparse_path) / "0"
    if sparse_model.exists():
        files = list(sparse_model.glob("*"))
        print(f"\n  Reconstruction successful!")
        print(f"  Output: {sparse_model}")
        for f in files:
            print(f"    - {f.name} ({f.stat().st_size / 1024:.1f} KB)")
    else:
        print("\nWarning: No reconstruction model found. COLMAP may have failed silently.")
        sys.exit(1)

    return str(sparse_model)


def run_automatic(image_dir: str, output_dir: str, quality: str = "medium"):
    """Alternative: use COLMAP's automatic_reconstructor (simpler but less control)."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    print("Running COLMAP automatic reconstruction...")
    cmd = [
        "colmap", "automatic_reconstructor",
        "--workspace_path", str(out),
        "--image_path", image_dir,
        "--quality", quality,
        "--single_camera", "1",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Reconstruction failed:\n{result.stderr}")
        sys.exit(1)

    print("Reconstruction complete!")


def main():
    parser = argparse.ArgumentParser(description="Run COLMAP SfM on extracted frames")
    parser.add_argument("images", help="Path to image directory")
    parser.add_argument("--output", "-o", default="./colmap_output", help="Output directory")
    parser.add_argument("--quality", choices=["low", "medium", "high"], default="medium")
    parser.add_argument("--automatic", action="store_true", help="Use automatic_reconstructor (simpler)")
    args = parser.parse_args()

    if not Path(args.images).exists():
        print(f"Error: Image directory not found: {args.images}")
        sys.exit(1)

    if not check_colmap():
        print("Error: COLMAP not found!")
        print("\nInstall options:")
        print("  macOS:  brew install colmap")
        print("  Ubuntu: sudo apt install colmap")
        print("  Docker: docker pull colmap/colmap")
        print("  Build:  https://colmap.github.io/install.html")
        sys.exit(1)

    if args.automatic:
        run_automatic(args.images, args.output, args.quality)
    else:
        sparse_path = run_colmap(args.images, args.output, args.quality)
        print(f"\nDone! COLMAP output in {args.output}/")
        print(f"Next step: python 03_train_splat.py {args.images} --colmap {sparse_path}")


if __name__ == "__main__":
    main()
