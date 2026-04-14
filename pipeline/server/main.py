#!/usr/bin/env python3
"""
FastAPI server for the video → 3D Gaussian Splatting pipeline.

Usage:
    cd pipeline/server
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000

Endpoints:
    POST /api/process   — upload video, starts pipeline
    GET  /api/progress/{job_id} — SSE stream of progress
    GET  /api/result/{job_id}   — download resulting .ply
"""

import asyncio
import json
import os
import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

app = FastAPI(title="3D Pipeline Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Job storage
jobs: dict[str, dict] = {}

PIPELINE_DIR = Path(__file__).parent.parent  # pipeline/ directory
OUTPUT_BASE = Path(tempfile.gettempdir()) / "3d_pipeline"
OUTPUT_BASE.mkdir(exist_ok=True)


@app.post("/api/process")
async def start_processing(file: UploadFile = File(...)):
    """Upload a video and start the 3D reconstruction pipeline."""
    job_id = str(uuid.uuid4())[:8]
    job_dir = OUTPUT_BASE / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded file
    video_path = job_dir / file.filename
    with open(video_path, "wb") as f:
        content = await file.read()
        f.write(content)

    jobs[job_id] = {
        "status": "queued",
        "step": 0,
        "total_steps": 4,
        "message": "Queued",
        "video_path": str(video_path),
        "job_dir": str(job_dir),
        "result_path": None,
        "error": None,
    }

    # Run pipeline in background
    asyncio.create_task(run_pipeline(job_id))

    return {"job_id": job_id, "status": "queued"}


async def run_pipeline(job_id: str):
    """Run the 4-step pipeline as subprocesses."""
    job = jobs[job_id]
    job_dir = Path(job["job_dir"])
    video_path = job["video_path"]
    frames_dir = str(job_dir / "frames")
    colmap_dir = str(job_dir / "colmap")
    gs_dir = str(job_dir / "gs_output")

    steps = [
        {
            "name": "Extracting frames",
            "cmd": [
                "python3", str(PIPELINE_DIR / "01_extract_frames.py"),
                video_path,
                "--output", frames_dir,
                "--fps", "2",
                "--skip-blur-filter",
            ],
        },
        {
            "name": "Running COLMAP (Structure-from-Motion)",
            "cmd": [
                "python3", str(PIPELINE_DIR / "02_run_colmap.py"),
                frames_dir,
                "--output", colmap_dir,
                "--quality", "medium",
            ],
        },
        {
            "name": "Training Gaussian Splatting",
            "cmd": [
                "python3", str(PIPELINE_DIR / "03_train_splat.py"),
                frames_dir,
                "--colmap", str(Path(colmap_dir) / "sparse" / "0"),
                "--output", gs_dir,
                "--method", "nerfstudio",
                "--steps", "2000",
            ],
        },
        {
            "name": "Converting to .ply",
            "cmd": None,  # handled inline
        },
    ]

    for i, step in enumerate(steps):
        job["step"] = i + 1
        job["status"] = "running"
        job["message"] = f"{step['name']} ({i + 1}/{len(steps)})"

        if step["cmd"] is None:
            # Step 4: find .ply and serve it
            ply_files = list(Path(gs_dir).rglob("*.ply"))
            if ply_files:
                job["result_path"] = str(ply_files[0])
                job["status"] = "done"
                job["message"] = "Complete!"
            else:
                job["status"] = "error"
                job["error"] = "No .ply file generated"
            return

        try:
            proc = await asyncio.create_subprocess_exec(
                *step["cmd"],
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                job["status"] = "error"
                job["error"] = f"Step {i + 1} failed: {stderr.decode()[:500]}"
                return

        except Exception as e:
            job["status"] = "error"
            job["error"] = f"Step {i + 1} exception: {str(e)}"
            return

    job["status"] = "done"
    job["message"] = "Complete!"


@app.get("/api/progress/{job_id}")
async def get_progress(job_id: str):
    """Server-Sent Events stream for job progress."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    async def event_generator():
        while True:
            job = jobs[job_id]
            data = json.dumps({
                "status": job["status"],
                "step": job["step"],
                "total_steps": job["total_steps"],
                "message": job["message"],
                "error": job["error"],
                "result_url": f"/api/result/{job_id}" if job["result_path"] else None,
            })
            yield f"data: {data}\n\n"

            if job["status"] in ("done", "error"):
                break
            await asyncio.sleep(2)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/result/{job_id}")
async def get_result(job_id: str):
    """Download the resulting .ply file."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    job = jobs[job_id]
    if not job["result_path"] or not Path(job["result_path"]).exists():
        raise HTTPException(404, "Result not ready")

    return FileResponse(
        job["result_path"],
        media_type="application/octet-stream",
        filename=f"model_{job_id}.ply",
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}
