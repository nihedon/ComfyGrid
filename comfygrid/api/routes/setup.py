import asyncio
import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from comfygrid.domain import callbacks
from comfygrid.schemas.setup import LaunchRequest
from comfygrid.services import setup_service
from comfygrid.services.comfyui import ComfyUIService
from comfygrid.services.dependencies import get_comfy_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/config")
async def get_setup_config():
    return setup_service.get_setup_config()


@router.get("/status")
async def get_setup_status(comfy_service: ComfyUIService = Depends(get_comfy_service)):
    return {
        "mode": comfy_service.mode,
        "connect_port": comfy_service.connect_port is not None,
    }


@router.post("/launch")
async def launch_comfyui(request: Request, body: LaunchRequest, comfy_service: ComfyUIService = Depends(get_comfy_service)):

    if comfy_service.started:
        return JSONResponse({"error": "ComfyUI is already running"}, status_code=409)

    current_port = os.environ.get("COMFYUI_PORT")

    async def restart_caddy_if_needed(new_port: int | None):
        if new_port and str(new_port) != current_port:
            await asyncio.sleep(0.5)
            await asyncio.to_thread(setup_service.start_caddy_proxy)

    if body.mode == "launch":
        if not body.workspace:
            return JSONResponse({"error": "workspace is required for launch mode"}, status_code=400)

        main_path = Path(body.workspace.script_path)
        if not main_path.exists() or not main_path.is_file():
            return JSONResponse({"error": f"ComfyUI main script not found: {main_path}"}, status_code=400)

        python_path = Path(body.workspace.python_path)
        if not python_path.exists() or not python_path.is_file():
            return JSONResponse({"error": f"Python executable not found: {python_path}"}, status_code=400)

        setup_service.save_launch_workspace(body.workspace)
        comfy_service.apply_launch_config(body.workspace)

        async def background_launch():
            loop = asyncio.get_running_loop()

            def on_progress(desc, current, total):
                payload = {
                    "type": "comfygrid.download_progress",
                    "desc": desc,
                    "current": current,
                    "total": total,
                    "percent": int(current * 100 / total) if total else 0
                }

                async def send():
                    for ws in comfy_service.startup_log_clients:
                        try:
                            await ws.send_json(payload)
                        except Exception:
                            pass
                try:
                    asyncio.run_coroutine_threadsafe(send(), loop)
                except Exception:
                    pass

            comfy_service._broadcast_startup_log("Preparing environment...")
            await asyncio.to_thread(setup_service.install_ffmpeg, lambda c, t: on_progress("FFmpeg", c, t))

            comfy_service._broadcast_startup_log("Checking extensions...")
            await asyncio.to_thread(setup_service.prepare_launch_dependencies, comfy_service)

            await restart_caddy_if_needed(body.workspace.comfyui_port)
            asyncio.create_task(
                asyncio.to_thread(callbacks.call_callbacks, "on_app_started", request.app)
            )
            await comfy_service.run()

        asyncio.create_task(background_launch())

    elif body.mode == "connect":
        if not body.connect_port:
            return JSONResponse({"error": "connect_port is required for connect mode"}, status_code=400)

        setup_service.save_connect_port(body.connect_port)
        comfy_service.apply_connect_config(body.connect_port)

        async def background_connect():
            await restart_caddy_if_needed(body.connect_port)
            asyncio.create_task(
                asyncio.to_thread(callbacks.call_callbacks, "on_app_started", request.app)
            )
            await comfy_service.run()

        asyncio.create_task(background_connect())

    else:
        return JSONResponse({"error": "Invalid mode"}, status_code=400)

    return {"message": "ok"}
