import logging

from fastapi import APIRouter, Depends, WebSocket
from starlette.websockets import WebSocketDisconnect

from comfygrid.services.comfyui import ComfyUIService
from comfygrid.services.dependencies import get_comfy_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/startup-logs")
async def _(ws: WebSocket, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    """WebSocket endpoint for streaming ComfyUI startup logs"""
    await ws.accept()

    comfy_service.startup_log_clients.append(ws)

    try:
        await ws.send_json({"type": "comfygrid.comfyui_status", "started": comfy_service.started})

        if comfy_service.mode == "launch" and comfy_service.started or comfy_service.mode == "connect" and comfy_service.url:
            await ws.send_json({"type": "comfygrid.startup_log", "message": "ComfyUI is already running"})
        else:
            await ws.send_json({"type": "comfygrid.startup_log", "message": "Waiting for ComfyUI to start..."})

        for message in comfy_service.log_history:
            await ws.send_json({"type": "comfygrid.startup_log", "message": message})

    except Exception as e:
        logger.error(f"Failed to send initial message: {e}")

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        logger.info("Startup logs WebSocket disconnected normally")
    except Exception as e:
        logger.error(f"Startup logs WebSocket error: {e}", exc_info=True)
    finally:
        if ws in comfy_service.startup_log_clients:
            comfy_service.startup_log_clients.remove(ws)
        logger.info("Startup logs WebSocket connection closed.")
