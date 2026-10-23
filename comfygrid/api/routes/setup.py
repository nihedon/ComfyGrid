import asyncio
import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from comfygrid.domain import callbacks
from comfygrid.schemas.setup import LaunchRequest, WorkspaceInfo
from comfygrid.services import setup_service
from comfygrid.services.comfyui import ComfyUIService
from comfygrid.services.dependencies import get_comfy_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/config")
def get_setup_config(comfy_service: ComfyUIService = Depends(get_comfy_service)):
    return {**setup_service.get_setup_config(), "active_profile_id": setup_service.active_profile_id(comfy_service)}


@router.post("/profiles")
def create_profile(body: WorkspaceInfo):
    try:
        return setup_service.save_profile(body)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)


@router.put("/profiles/{profile_id}")
def update_profile(profile_id: str, body: WorkspaceInfo, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    if setup_service.active_profile_id(comfy_service) == profile_id:
        # Keep the running identity even if its next-launch settings are edited.
        comfy_service.setup_profile_id = profile_id
    try:
        return setup_service.save_profile(body, profile_id)
    except KeyError:
        return JSONResponse({"error": "Profile not found."}, status_code=404)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)


@router.delete("/profiles/{profile_id}")
def delete_profile(profile_id: str, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    if setup_service.active_profile_id(comfy_service) == profile_id:
        return JSONResponse({"error": "Stop this profile before deleting it."}, status_code=409)
    try:
        setup_service.delete_profile(profile_id)
        return {"message": "deleted"}
    except KeyError:
        return JSONResponse({"error": "Profile not found."}, status_code=404)


@router.get("/status")
async def get_setup_status(comfy_service: ComfyUIService = Depends(get_comfy_service)):
    return {
        "mode": comfy_service.mode,
        "launched": bool(getattr(comfy_service, "setup_starting", False) or comfy_service.proc or comfy_service.started),
        "connect_port": comfy_service.connect_port is not None,
    }


@router.post("/stop")
async def stop_comfyui(comfy_service: ComfyUIService = Depends(get_comfy_service)):
    task = getattr(comfy_service, "setup_task", None)
    if task is not None and not task.done():
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    comfy_service.setup_starting = False
    if comfy_service.proc or comfy_service.started:
        logger.info("Stopping ComfyUI instance...")
    await comfy_service.exit()
    return {"message": "stopped"}


@router.post("/launch")
async def launch_comfyui(request: Request, body: LaunchRequest, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    if getattr(comfy_service, "setup_starting", False):
        return JSONResponse({"error": "A profile is already starting."}, status_code=409)
    profile = None
    if getattr(body, "profile_id", None):
        try:
            profile = setup_service.get_profile(body.profile_id)
        except KeyError:
            return JSONResponse({"error": "Profile not found."}, status_code=404)
        body = LaunchRequest(mode=profile.mode, workspace=profile, connect_host=profile.connect_host,
                             connect_port=profile.connect_port, profile_id=profile.id)

    if body.mode == "launch":
        if not body.workspace:
            return JSONResponse({"error": "workspace is required for launch mode"}, status_code=400)
        for label, value in [("ComfyUI main script", body.workspace.script_path), ("Python executable", body.workspace.python_path)]:
            if not value or not Path(value).is_file():
                return JSONResponse({"error": f"{label} not found: {value}"}, status_code=400)
    elif not body.connect_port or not 1 <= body.connect_port <= 65535:
        return JSONResponse({"error": "A valid connect_port is required"}, status_code=400)

    current_port = os.environ.get("COMFYUI_PORT")
    comfy_service.setup_starting = True
    try:
        await comfy_service.exit()
        if profile:
            setup_service.activate_profile(profile)
        elif body.mode == "launch":
            setup_service.save_launch_workspace(body.workspace)
        else:
            setup_service.save_connect_port(body.connect_port, body.connect_host or "127.0.0.1")
        comfy_service.setup_profile_id = profile.id if profile else None
    except Exception:
        comfy_service.setup_starting = False
        raise

    async def run_background(action):
        from comfygrid.infrastructure.download import observe_downloads

        def download_activity(active: bool):
            comfy_service.startup_downloading = active
            comfy_service._broadcast_startup_log({"type": "comfygrid.download_state", "active": active})

        try:
            with observe_downloads(download_activity):
                await action()
        except Exception:
            logger.exception("Profile startup failed")
            await comfy_service.exit()
        finally:
            comfy_service.setup_starting = False

    async def restart_caddy_if_needed(new_port: int | None):
        if new_port and str(new_port) != current_port:
            await asyncio.sleep(0.5)
            await asyncio.to_thread(setup_service.start_caddy_proxy)

    if body.mode == "launch":
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

        comfy_service.setup_task = asyncio.create_task(run_background(background_launch))

    elif body.mode == "connect":
        connect_host = body.connect_host or "127.0.0.1"
        comfy_service.apply_connect_config(body.connect_port, connect_host)

        async def background_connect():
            await asyncio.sleep(0.5)
            await asyncio.to_thread(setup_service.start_caddy_proxy)
            asyncio.create_task(
                asyncio.to_thread(callbacks.call_callbacks, "on_app_started", request.app)
            )
            await comfy_service.run()

        comfy_service.setup_task = asyncio.create_task(run_background(background_connect))

    else:
        return JSONResponse({"error": "Invalid mode"}, status_code=400)

    return {"message": "ok"}
