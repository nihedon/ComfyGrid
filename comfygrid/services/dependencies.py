from fastapi.requests import HTTPConnection

from comfygrid.services.comfyui import ComfyUIService


def get_comfy_service(conn: HTTPConnection) -> ComfyUIService:
    return conn.app.state.comfy_service
