import base64
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from comfygrid.services import workflow_service
from comfygrid.services.comfyui import ComfyUIService
from comfygrid.services.dependencies import get_comfy_service

router = APIRouter()
logger = logging.getLogger(__name__)


class CreateFolderRequest(BaseModel):
    folder_path: str


class RenameRequest(BaseModel):
    old_path: str
    new_name: str


class MoveRequest(BaseModel):
    source_path: str
    target_dir_path: str


class DeleteRequest(BaseModel):
    path: str


class FavoriteRequest(BaseModel):
    path: str
    is_favorite: bool | None = None


class SaveThumbnailRequest(BaseModel):
    path: str
    image_base64: str


@router.get("/workflows")
async def get_workflows(comfy_service: ComfyUIService = Depends(get_comfy_service)) -> dict[str, Any]:
    try:
        return workflow_service.list_workflows(comfy_service.comfyui_path)
    except Exception as e:
        logger.error("Failed to list workflows: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workflows/folder")
async def create_folder(req: CreateFolderRequest, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    try:
        workflow_service.create_folder(comfy_service.comfyui_path, req.folder_path)
        return {"status": "ok"}
    except Exception as e:
        logger.error("Failed to create folder: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/workflows/rename")
async def rename_item(req: RenameRequest, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    try:
        new_path = workflow_service.rename_item(comfy_service.comfyui_path, req.old_path, req.new_name)
        return {"status": "ok", "new_path": new_path}
    except Exception as e:
        logger.error("Failed to rename workflow item: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/workflows/move")
async def move_item(req: MoveRequest, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    try:
        new_path = workflow_service.move_item(comfy_service.comfyui_path, req.source_path, req.target_dir_path)
        return {"status": "ok", "new_path": new_path}
    except Exception as e:
        logger.error("Failed to move workflow item: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/workflows")
async def delete_item(req: DeleteRequest, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    try:
        workflow_service.delete_item(comfy_service.comfyui_path, req.path)
        return {"status": "ok"}
    except Exception as e:
        logger.error("Failed to delete workflow item: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/workflows/favorite")
async def toggle_favorite(req: FavoriteRequest, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    try:
        is_fav = workflow_service.toggle_favorite(comfy_service.comfyui_path, req.path, req.is_favorite)
        return {"status": "ok", "is_favorite": is_fav}
    except Exception as e:
        logger.error("Failed to toggle favorite: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/workflows/content")
async def get_workflow_content(path: str = Query(...), comfy_service: ComfyUIService = Depends(get_comfy_service)):
    try:
        return workflow_service.get_workflow_content(comfy_service.comfyui_path, path)
    except Exception as e:
        logger.error("Failed to get workflow content: %s", e)
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/workflows/thumbnail")
async def get_workflow_thumbnail(path: str = Query(...), comfy_service: ComfyUIService = Depends(get_comfy_service)):
    thumb_path = workflow_service.get_workflow_thumbnail_path(comfy_service.comfyui_path, path)
    if not thumb_path or not thumb_path.is_file():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    media_type = "image/webp"
    suffix = thumb_path.suffix.lower()
    if suffix == ".png":
        media_type = "image/png"
    elif suffix in [".jpg", ".jpeg"]:
        media_type = "image/jpeg"
    return FileResponse(thumb_path, media_type=media_type)


@router.post("/workflows/thumbnail")
async def save_workflow_thumbnail(req: SaveThumbnailRequest, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    try:
        raw_b64 = req.image_base64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(raw_b64)
        workflow_service.save_workflow_thumbnail(comfy_service.comfyui_path, req.path, image_bytes)
        return {"status": "ok"}
    except Exception as e:
        logger.error("Failed to save workflow thumbnail: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
