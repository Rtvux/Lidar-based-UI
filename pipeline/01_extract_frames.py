#!/usr/bin/env python3
"""
Step 1: Extract high-quality frames from a 360° video.

Usage:
    python 01_extract_frames.py input_video.mp4 --output ./frames --fps 2

What it does:
    1. Extracts frames from video at specified FPS
    2. Detects and removes blurry frames (Laplacian variance)
    3. Outputs numbered sharp frames ready for COLMAP
"""

import argparse
import subprocess
import sys
from pathlib import Path

try:
    import cv2
    import numpy as np
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


def extract_frames(video_path: str, output_dir: str, fps: float = 2.0):
    """Extract frames from video using ffmpeg."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps={fps}",
        "-q:v", "2",  # high quality JPEG
        str(out / "frame_%05d.jpg"),
        "-y"
    ]

    print(f"Extracting frames at {fps} FPS...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ffmpeg error: {result.stderr}")
        sys.exit(1)

    frames = sorted(out.glob("frame_*.jpg"))
    print(f"Extracted {len(frames)} frames")
    return frames


def compute_blur_score(image_path: str) -> float:
    """Compute Laplacian variance as blur metric. Higher = sharper."""
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return 0.0
    return cv2.Laplacian(img, cv2.CV_64F).var()


def filter_blurry_frames(frame_dir: str, threshold: float = 50.0):
    """Remove frames below the blur threshold."""
    frames = sorted(Path(frame_dir).glob("frame_*.jpg"))
    if not frames:
        print("No frames found to filter")
        return

    scores = []
    for f in frames:
        score = compute_blur_score(str(f))
        scores.append((f, score))

    # Use adaptive threshold: remove bottom 20% or below absolute threshold
    all_scores = [s for _, s in scores]
    adaptive_threshold = max(threshold, np.percentile(all_scores, 20))

    removed = 0
    kept = 0
    for frame_path, score in scores:
        if score < adaptive_threshold:
            frame_path.unlink()
            removed += 1
        else:
            kept += 1

    print(f"Blur filtering: kept {kept}, removed {removed} (threshold: {adaptive_threshold:.1f})")

    # Renumber remaining frames sequentially
    remaining = sorted(Path(frame_dir).glob("frame_*.jpg"))
    for i, f in enumerate(remaining, 1):
        new_name = f.parent / f"frame_{i:05d}.jpg"
        if f != new_name:
            f.rename(new_name)


def main():
    parser = argparse.ArgumentParser(description="Extract sharp frames from video")
    parser.add_argument("video", help="Path to input video file")
    parser.add_argument("--output", "-o", default="./frames", help="Output directory")
    parser.add_argument("--fps", type=float, default=2.0, help="Frames per second to extract (default: 2)")
    parser.add_argument("--blur-threshold", type=float, default=50.0, help="Blur threshold (higher = stricter)")
    parser.add_argument("--skip-blur-filter", action="store_true", help="Skip blur detection")
    args = parser.parse_args()

    if not Path(args.video).exists():
        print(f"Error: Video file not found: {args.video}")
        sys.exit(1)

    # Check ffmpeg
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except FileNotFoundError:
        print("Error: ffmpeg not found. Install with: brew install ffmpeg")
        sys.exit(1)

    # Extract
    extract_frames(args.video, args.output, args.fps)

    # Filter blurry frames
    if not args.skip_blur_filter:
        if HAS_CV2:
            filter_blurry_frames(args.output, args.blur_threshold)
        else:
            print("Warning: opencv-python not installed, skipping blur detection")
            print("Install with: pip install opencv-python numpy")

    final_count = len(list(Path(args.output).glob("frame_*.jpg")))
    print(f"\nDone! {final_count} frames ready in {args.output}/")
    print(f"Next step: python 02_run_colmap.py {args.output}")


if __name__ == "__main__":
    main()
