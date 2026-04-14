#!/bin/bash
#
# Full Pipeline: 360° Video → 3D Gaussian Splat → Browser
#
# Usage:
#   ./run_pipeline.sh path/to/video.mp4 [output_dir]
#
# Example:
#   ./run_pipeline.sh ~/Videos/person_360.mp4 ./my_scan
#

set -e

VIDEO="$1"
OUTPUT_DIR="${2:-./pipeline_output}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$VIDEO" ]; then
    echo "Usage: ./run_pipeline.sh <video_path> [output_dir]"
    echo ""
    echo "Pipeline steps:"
    echo "  1. Extract frames from video (ffmpeg)"
    echo "  2. Run COLMAP Structure-from-Motion"
    echo "  3. Train 3D Gaussian Splatting"
    echo "  4. Convert to .splat for browser"
    echo ""
    echo "Prerequisites:"
    echo "  brew install ffmpeg colmap"
    echo "  pip install opencv-python numpy nerfstudio"
    exit 1
fi

if [ ! -f "$VIDEO" ]; then
    echo "Error: Video file not found: $VIDEO"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "============================================"
echo "  360° Video → 3D Gaussian Splat Pipeline"
echo "============================================"
echo ""
echo "  Input:  $VIDEO"
echo "  Output: $OUTPUT_DIR"
echo ""

# Step 1: Extract frames
echo "━━━ Step 1/4: Extracting frames ━━━"
python3 "$SCRIPT_DIR/01_extract_frames.py" "$VIDEO" \
    --output "$OUTPUT_DIR/frames" \
    --fps 2

echo ""

# Step 2: COLMAP SfM
echo "━━━ Step 2/4: Running COLMAP ━━━"
python3 "$SCRIPT_DIR/02_run_colmap.py" "$OUTPUT_DIR/frames" \
    --output "$OUTPUT_DIR/colmap"

echo ""

# Step 3: Train Gaussian Splatting
echo "━━━ Step 3/4: Training Gaussian Splatting ━━━"
python3 "$SCRIPT_DIR/03_train_splat.py" "$OUTPUT_DIR/frames" \
    --colmap "$OUTPUT_DIR/colmap/sparse/0" \
    --output "$OUTPUT_DIR/gs_model" \
    --method nerfstudio \
    --steps 2000

echo ""

# Step 4: Convert to .splat
echo "━━━ Step 4/4: Converting to .splat ━━━"
PLY_FILE=$(find "$OUTPUT_DIR/gs_model" -name "*.ply" | head -1)
if [ -n "$PLY_FILE" ]; then
    python3 "$SCRIPT_DIR/04_convert_to_splat.py" "$PLY_FILE" \
        --output "$OUTPUT_DIR/output.splat"
else
    echo "Warning: No .ply file found. You may need to export manually."
    echo "  For nerfstudio: ns-export gaussian-splat --load-config <config> --output-dir $OUTPUT_DIR"
fi

echo ""
echo "============================================"
echo "  Pipeline complete!"
echo "============================================"
echo ""
echo "  Output: $OUTPUT_DIR/output.splat"
echo ""
echo "  To view in browser:"
echo "    1. cd '$(dirname "$SCRIPT_DIR")'"
echo "    2. npm run dev"
echo "    3. Open http://localhost:5173"
echo "    4. Drag & drop $OUTPUT_DIR/output.splat"
echo ""
