import logging

from engineio import AsyncClient
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from comfygrid.services import comfyui_input_service
from comfygrid.services.comfyui import ComfyUIService
from comfygrid.services.dependencies import get_comfy_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/upload")
async def upload(comfy_service: ComfyUIService = Depends(get_comfy_service), file: UploadFile = File(...), filename: str = Form(...)):
    if filename is None or filename == "":
        return JSONResponse({"error": "Invalid file name"}, status_code=400)

    comfyui_input_service.save_upload_to_input(
        comfy_service.comfyui_path,
        file.file,
        filename,
    )
    return {"message": "uploaded"}


@router.post("/upload_to_input")
async def upload_to_input(request: Request, data: dict, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    url = data.get("url", "")
    filename = data.get("filename", "")
    if not url or not filename:
        return JSONResponse({"error": "url and filename are required"}, status_code=400)

    client: AsyncClient = request.app.state.client
    response = await client.get(url)
    if response.status_code != 200:
        return JSONResponse({"error": "Failed to fetch image"}, status_code=500)

    comfyui_input_service.save_bytes_to_input(
        comfy_service.comfyui_path,
        response.content,
        filename,
    )
    return {"message": "uploaded"}


@router.post("/restart")
async def restart(comfy_service: ComfyUIService = Depends(get_comfy_service)):
    await comfy_service.restart()
    return {"message": "restarting"}


@router.get("/healthcheck/comfyui")
async def healthcheck(comfy_service: ComfyUIService = Depends(get_comfy_service)):
    started = bool(comfy_service.started)
    if comfy_service.mode is None or comfy_service.mode == "launch" and not started:
        return {"error": "ComfyUI not started"}
    return {"started": True}
