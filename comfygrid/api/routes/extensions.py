from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from comfygrid.services import extension_service

router = APIRouter()

MEDIA_TYPES = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "application/javascript",
    ".json": "application/json",
}


@router.get("/custom_nodes")
def list_extensions():
    return extension_service.list_custom_nodes()


@router.get("/custom_nodes/{name}/assets/{asset_path:path}")
def serve_extension_asset(name: str, asset_path: str):
    path = extension_service.get_custom_asset_path(name, asset_path)
    if path is None:
        raise HTTPException(status_code=404, detail=f"Asset '{asset_path}' not found")
    return FileResponse(path, media_type=MEDIA_TYPES.get(path.suffix, "application/octet-stream"))
