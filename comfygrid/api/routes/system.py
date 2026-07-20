import asyncio
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

import httpx
import orjson
import psutil
from fastapi import APIRouter, BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

router = APIRouter()


try:
    import pynvml
    pynvml.nvmlInit()
    _NVML = True
except Exception:
    _NVML = False

_NVIDIA_SMI = shutil.which("nvidia-smi") is not None


def _gpu_via_nvml() -> dict | None:
    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(handle)
        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
        mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
        temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
        return {
            "name":       name if isinstance(name, str) else name.decode(),
            "gpu_pct":    round(util.gpu, 1),
            "vram_used":  round(mem.used / 1024**3, 2),
            "vram_total": round(mem.total / 1024**3, 2),
            "vram_pct":   round(mem.used / mem.total * 100, 1),
            "temp_c":     temp,
            "available":  True,
        }
    except Exception:
        return None


def _gpu_via_smi() -> dict | None:
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            timeout=3,
        ).decode().strip().split("\n")[0]
        name, gpu_pct, mem_used, mem_total, temp = [s.strip() for s in out.split(",")]
        used = float(mem_used)
        total = float(mem_total)
        return {
            "name":       name,
            "gpu_pct":    round(float(gpu_pct), 1),
            "vram_used":  round(used / 1024, 2),   # MiB → GiB
            "vram_total": round(total / 1024, 2),
            "vram_pct":   round(used / total * 100, 1) if total else 0,
            "temp_c":     int(temp),
            "available":  True,
        }
    except Exception:
        return None


def get_gpu_data() -> dict:
    data = None
    if _NVML:
        data = _gpu_via_nvml()
    if data is None and _NVIDIA_SMI:
        data = _gpu_via_smi()
    return data or {"available": False}


# Initialize psutil cpu percent calculation
psutil.cpu_percent(percpu=True)


def collect_snapshot() -> dict:
    cpu_per_core = psutil.cpu_percent(percpu=True)
    if not cpu_per_core:
        cpu_per_core = [0.0]
    cpu_total = round(sum(cpu_per_core) / len(cpu_per_core), 1)
    freq = psutil.cpu_freq()

    ram = psutil.virtual_memory()

    gpu = get_gpu_data()

    return {
        "cpu": {
            "total":    cpu_total,
            "per_core": [round(c, 1) for c in cpu_per_core],
            "freq_mhz": round(freq.current) if freq else None,
        },
        "ram": {
            "used_gb":  round(ram.used / 1024**3, 2),
            "total_gb": round(ram.total / 1024**3, 2),
            "pct":      round(ram.percent, 1),
        },
        "gpu": gpu,
    }


@router.get("/stats")
async def get_stats():
    return await asyncio.to_thread(collect_snapshot)


@router.get("/stats/stream")
async def stream_stats():
    async def generator():
        while True:
            data = await asyncio.to_thread(collect_snapshot)
            yield f"data: {orjson.dumps(data).decode()}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/update/check")
async def check_update():
    current_version = "dev"
    version_file = Path("version.json")
    if version_file.exists():
        try:
            tag = orjson.loads(version_file.read_text(encoding="utf-8")).get("tag")
            if tag:
                current_version = tag
        except Exception:
            pass

    if current_version == "dev":
        return {
            "current_version": current_version,
            "latest_version": current_version,
            "has_update": False,
            "download_url": None,
            "release_notes": ""
        }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://api.github.com/repos/nihedon/ComfyGrid/releases/latest", timeout=5.0)
            resp.raise_for_status()
            release = resp.json()
            latest_version = release.get("tag_name", current_version)
            download_url = None
            for asset in release.get("assets", []):
                if asset.get("name", "").endswith(".zip"):
                    download_url = asset["browser_download_url"]
                    break

            has_update = False
            if latest_version != current_version:
                has_update = True

            return {
                "current_version": current_version,
                "latest_version": latest_version,
                "has_update": has_update,
                "download_url": download_url,
                "release_notes": release.get("body", "")
            }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

