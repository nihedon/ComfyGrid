from fastapi import HTTPException
from fastapi.requests import HTTPConnection

from comfygrid.services.comfyui import ComfyUIService


def get_comfy_service(conn: HTTPConnection) -> ComfyUIService:
    if not hasattr(conn.app.state, "comfy_service"):
        raise HTTPException(status_code=503, detail="Service not ready")
    return conn.app.state.comfy_service
