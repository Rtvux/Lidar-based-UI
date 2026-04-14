# Pipeline Setup Guide

## Quick Overview

```
360° Video → Frame Extraction → COLMAP (SfM) → Gaussian Splatting Training → .splat → Browser
```

## Prerequisites

### 1. FFmpeg (frame extraction)
```bash
brew install ffmpeg
```

### 2. COLMAP (Structure-from-Motion)
```bash
brew install colmap
```

### 3. Python dependencies
```bash
pip install opencv-python numpy
```

### 4. Gaussian Splatting Training (choose one)

#### Option A: Nerfstudio (recommended, works on Mac)
```bash
pip install nerfstudio
# On Mac with Apple Silicon:
pip install gsplat  # may need: PYTORCH_ENABLE_MPS_FALLBACK=1
```

#### Option B: OpenSplat (native Metal support on Mac)
```bash
git clone https://github.com/pierotofy/OpenSplat.git
cd OpenSplat && mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j$(sysctl -n hw.ncpu)
# Add build/opensplat to your PATH
```

#### Option C: Google Colab (no local GPU needed)
Use: https://github.com/camenduru/gaussian-splatting-colab

---

## Running the Pipeline

### Full automatic pipeline
```bash
cd pipeline
./run_pipeline.sh path/to/your/video.mp4
```

### Step by step
```bash
# 1. Extract frames
python 01_extract_frames.py video.mp4 --output ./frames --fps 2

# 2. Run COLMAP
python 02_run_colmap.py ./frames --output ./colmap_output

# 3. Train Gaussian Splatting
python 03_train_splat.py ./frames \
    --colmap ./colmap_output/sparse/0 \
    --method nerfstudio \
    --steps 2000

# 4. Convert to browser format
python 04_convert_to_splat.py ./gs_output/point_cloud.ply --output result.splat
```

### View in browser
```bash
cd ..  # back to project root
npm run dev
# Open http://localhost:5173 and drag-drop the .splat file
```

---

## Tips for Good Results

### Capture tips
- Walk slowly around the person/object in a full circle
- Keep the subject centered in frame
- Maintain consistent distance (~1-2 meters)
- Good, even lighting (avoid harsh shadows)
- Avoid motion blur (steady hands or gimbal)
- Aim for 50+ frames with good overlap

### Training quality
- `--steps 2000` = fast preview (~5-12 min)
- `--steps 7000` = good quality (~20-30 min)
- `--steps 30000` = best quality (~1-2 hours)

### Troubleshooting
- **COLMAP fails**: Need more frame overlap, try `--fps 4` in step 1
- **Bad reconstruction**: Remove blurry frames, ensure consistent lighting
- **Out of memory**: Reduce image resolution or use fewer images
- **Slow on Mac**: Use Google Colab for training, do everything else locally

---

## Alternative: Skip COLMAP entirely

### InstantSplat (COLMAP-free, <1 min training)
```bash
# Requires NVIDIA GPU
git clone https://github.com/NVlabs/InstantSplat.git
cd InstantSplat
# Follow their README for setup
```

### Feed-forward models (single image → 3D)
- AnySplat: https://github.com/InternRobotics/AnySplat
- Works from uncalibrated images, no COLMAP needed
