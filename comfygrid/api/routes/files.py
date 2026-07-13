import logging
import threading
import urllib.request
import tkinter as tk
from pathlib import Path
from tkinter import filedialog

import orjson
from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from comfygrid.infrastructure.cache import delete_thumbnail_cache
from comfygrid.services import file_service
from comfygrid.services.comfyui import ComfyUIService
from comfygrid.services.dependencies import get_comfy_service

router = APIRouter()
logger = logging.getLogger(__name__)


def open_dialog(dialog_func):
    result = {}

    def run():
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes("-topmost", True)
        result["path"] = dialog_func(root)
        root.destroy()
    t = threading.Thread(target=run)
    t.start()
    t.join()
    return result.get("path", "")


class FileDialogRequest(BaseModel):
    title: str
    filetypes: list[tuple[str, str]]
    initial_dir: str = ""


@router.post("/dialog/file")
def pick_file(req: FileDialogRequest):
    path = open_dialog(lambda root: filedialog.askopenfilename(
        parent=root,
        title=req.title,
        filetypes=req.filetypes,
        initialdir=req.initial_dir
    ))
    return {"path": path}


@router.get("/list")
def list_files(dir_name: str, ext: str, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    dir_name = dir_name.strip()
    extensions = [e.strip() for e in ext.split(",") if e.strip()]
    if not dir_name or not extensions:
        return JSONResponse({"error": "dir_name and ext are required"}, status_code=400)

    comfyui_path = Path(comfy_service.comfyui_path)
    return JSONResponse(file_service.list_models(comfyui_path, dir_name, extensions))


@router.get("/file={file_path:path}")
def get_file(file_path: str, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    path = file_service.resolve_file_path(comfy_service.comfyui_path, file_path)
    if path is None:
        return JSONResponse({"error": "Invalid path"}, status_code=404)
    return FileResponse(path)


@router.get("/model_info={path:path}")
def get_model_info(path: str, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    comfyui_path = Path(comfy_service.comfyui_path)
    full_path = comfyui_path / path

    if not str(full_path).startswith(str(comfyui_path)):
        return JSONResponse({"error": "Invalid path"}, status_code=400)

    name_without_ext = full_path.stem
    root = full_path.parent
    info = {}

    description_path = root / f"{name_without_ext}.description.txt"
    if description_path.exists():
        info["description"] = file_service._read_file(description_path)

    metadata_path = root / f"{name_without_ext}.civitai.info"
    if metadata_path.exists():
        try:
            info["metadata"] = orjson.loads(file_service._read_file(metadata_path).replace("¥", "\\"))
        except Exception as e:
            logger.error("Error processing file %s: %s", metadata_path, e)
            info["metadata"] = {}

    comfygrid_path = root / f"{name_without_ext}.comfygrid.info"
    if comfygrid_path.exists():
        try:
            cg_info = orjson.loads(file_service._read_file(comfygrid_path))
            info["rate"] = cg_info.get("rate")
            info["favorite"] = cg_info.get("favorite")
        except Exception as e:
            logger.error("Error processing file %s: %s", comfygrid_path, e)

    return JSONResponse(info)


@router.post("/model_info={path:path}")
async def save_model_info(request: Request, path: str, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    comfyui_path = Path(comfy_service.comfyui_path)
    full_path = comfyui_path / path

    if not str(full_path).startswith(str(comfyui_path)):
        return JSONResponse({"error": "Invalid path"}, status_code=400)

    name_without_ext = full_path.stem
    root = full_path.parent
    description_path = root / f"{name_without_ext}.description.txt"
    metadata_path = root / f"{name_without_ext}.civitai.info"
    comfygrid_path = root / f"{name_without_ext}.comfygrid.info"

    try:
        data = await request.json()
        
        if "metadata" in data:
            metadata_path.write_text(orjson.dumps(data["metadata"], option=orjson.OPT_INDENT_2).decode("utf-8"), encoding="utf-8")
        
        if "description" in data:
            description_path.write_text(data["description"], encoding="utf-8")
            
        cg_info = {}
        if "rate" in data:
            cg_info["rate"] = data["rate"]
        if "favorite" in data:
            cg_info["favorite"] = data["favorite"]
            
        if cg_info:
            comfygrid_path.write_text(orjson.dumps(cg_info, option=orjson.OPT_INDENT_2).decode("utf-8"), encoding="utf-8")
            
        if "previewUrl" in data and data["previewUrl"]:
            preview_path = root / f"{name_without_ext}.preview.png"
            try:
                req = urllib.request.Request(
                    data["previewUrl"],
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                )
                with urllib.request.urlopen(req) as response, open(preview_path, 'wb') as out_file:
                    out_file.write(response.read())
                delete_thumbnail_cache(str(preview_path))
            except Exception as e:
                logger.error("Error downloading preview image: %s", e)
            
        return {"message": "success"}
    except Exception as e:
        logger.error("Error saving model info: %s", e)
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/output={file_path:path}")
def get_output_file(file_path: str, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    path = file_service.resolve_output_path(comfy_service.output_directory, file_path)
    if path is None:
        return JSONResponse({"error": "Invalid path"}, status_code=404)
    return FileResponse(path)


@router.get("/thumbnail={path:path}")
def get_thumbnail(path: str, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    result, error = file_service.get_model_thumbnail(comfy_service.comfyui_path, path)
    if error is not None:
        status_code = 404 if error == "File not found" else 500
        return JSONResponse({"error": error}, status_code=status_code)
    return Response(content=result, media_type="image/webp")


@router.post("/apply_mask")
def apply_mask(
    file: UploadFile = File(...),
    mask: UploadFile = File(...),
    filename: str = Form(...),
    subfolder: str = Form(...),
    comfy_service: ComfyUIService = Depends(get_comfy_service),
):
    if filename is None or filename == "":
        return JSONResponse({"error": "Invalid file name"}, status_code=400)

    try:
        save_dir = Path(comfy_service.comfyui_path, "input", subfolder)
        save_dir.mkdir(exist_ok=True)
        file_service.apply_mask(file.file.read(), mask.file.read(), save_dir / filename)
        return {"message": "uploaded"}
    except Exception as e:
        logger.error("Error in apply_mask: %s", e)
        return JSONResponse({"error": str(e)}, status_code=500)


@router.delete("/delete_image")
def delete_image(type: str, filename: str, subfolder: str | None = None, comfy_service: ComfyUIService = Depends(get_comfy_service)):
    target_path, error = file_service.resolve_image_delete_path(
        comfy_service.comfyui_path,
        comfy_service.output_directory,
        type,
        filename,
        subfolder,
    )
    if error == "Invalid type":
        return JSONResponse({"error": error}, status_code=400)
    if error:
        return JSONResponse({"error": error}, status_code=400)
    if target_path is None or not target_path.is_file():
        return JSONResponse({"error": "File not found"}, status_code=404)

    try:
        target_path.unlink()
        comfyui_path = Path(comfy_service.comfyui_path)
        file_service.clear_model_cache(comfyui_path, type)
        return {"message": "deleted"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
