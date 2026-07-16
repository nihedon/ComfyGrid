import logging
import re
import threading
import tkinter as tk
import urllib.request
from pathlib import Path
from tkinter import filedialog
from urllib.parse import urlsplit, urlunsplit

import httpx
import orjson
from fastapi import (APIRouter, Depends, File, Form, Request, Response,
                     UploadFile)
from fastapi.responses import FileResponse, JSONResponse
from huggingface_hub import ModelCard
from pydantic import BaseModel

from comfygrid.infrastructure import model_repository
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


class FetchInfoRequest(BaseModel):
    url: str


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

    db_key = str(Path("models") / Path(path).relative_to("models")) if path.startswith("models/") else path
    db_meta = model_repository.get_model_meta(db_key)

    if db_meta is not None:
        info["url"] = db_meta.url
        info["nsfw"] = db_meta.nsfw
        info["rate"] = db_meta.rate
        info["favorite"] = db_meta.favorite
        info["trainedWords"] = db_meta.trained_words
    else:
        civitai_meta_path = root / f"{name_without_ext}.civitai.info"
        if civitai_meta_path.exists():
            try:
                metadata_dict = orjson.loads(file_service._read_file(civitai_meta_path).replace("¥", "\\"))
                id = metadata_dict.get("id", None)
                model_id = metadata_dict.get("modelId", None)
                if id is not None and model_id is not None and "downloadUrl" in metadata_dict:
                    download_url = metadata_dict["downloadUrl"]
                    parts = urlsplit(download_url)
                    site_url = urlunsplit((parts.scheme, parts.netloc, "/", "", ""))
                    info["url"] = f"{site_url}/models/{model_id}/?modelVersionId={id}"

                info["nsfw"] = bool(metadata_dict.get("model", {}).get("nsfw", False))
                raw_words = metadata_dict.get("trainedWords") or metadata_dict.get("trainedWord") or []
                info["trainedWords"] = raw_words if isinstance(raw_words, list) else []
            except Exception as e:
                logger.error("Error processing file %s: %s", civitai_meta_path, e)

        info.setdefault("url", None)
        info.setdefault("nsfw", False)
        info.setdefault("rate", None)
        info.setdefault("favorite", False)
        info.setdefault("trainedWords", [])

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

    db_key = str(Path("models") / Path(path).relative_to("models")) if path.startswith("models/") else path

    try:
        data = await request.json()

        if "description" in data:
            description_path.write_text(data["description"], encoding="utf-8")

        upsert_kwargs: dict = {}
        if "url" in data:
            upsert_kwargs["url"] = data["url"]
        if "nsfw" in data:
            upsert_kwargs["nsfw"] = bool(data["nsfw"])
        if "rate" in data:
            upsert_kwargs["rate"] = data["rate"]
        if "favorite" in data:
            upsert_kwargs["favorite"] = bool(data["favorite"])
        if "trainedWords" in data:
            words = data["trainedWords"]
            upsert_kwargs["trained_words"] = words if isinstance(words, list) else []

        if upsert_kwargs:
            model_repository.upsert_model_meta(db_key, **upsert_kwargs)

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


def _expand_huggingface_gallery(text: str, widget_data: list, resolve_link) -> str:
    if "<Gallery" not in text or not widget_data:
        return text

    gallery_html = '<div class="huggingface-gallery">\n'
    for w in widget_data:
        if isinstance(w, dict) and 'output' in w and 'url' in w['output']:
            img_url = w['output']['url']
            prompt_text = w.get('text', '')
            prompt_text = prompt_text.replace('<', '&lt;').replace('>', '&gt;')
            resolved_img_url = resolve_link(img_url, "resolve/main/") if not img_url.startswith("http") else img_url

            gallery_html += f'''
  <figure>
    <img loading="lazy" src="{resolved_img_url}" alt="Gallery image" />
    <figcaption>
      <dl>
        <dt>Prompt</dt>
        <dd>{prompt_text}</dd>
      </dl>
    </figcaption>
  </figure>
'''
    gallery_html += '</div>'
    return re.sub(r'<Gallery\s*/?>', gallery_html, text)


@router.post("/fetch_info")
async def fetch_info(request: FetchInfoRequest):
    url = request.url
    try:
        domain = urlsplit(url).netloc

        description = None
        if "civitai" in domain:
            model_id_match = re.search(r'/models/(\d+)/', url)
            if model_id_match:
                model_id = model_id_match.group(1)
                api_url = f"https://{domain}/api/v1/models/{model_id}"
                async with httpx.AsyncClient() as client:
                    resp = await client.get(api_url, timeout=10.0)
                    resp.raise_for_status()
                    description = resp.json().get("description", None)
            version_match = re.search(r'modelVersionId=(\d+)', url)
            if version_match:
                version_id = version_match.group(1)
                api_url = f"https://{domain}/api/v1/model-versions/{version_id}"
                async with httpx.AsyncClient() as client:
                    resp = await client.get(api_url, timeout=10.0)
                    resp.raise_for_status()
                    json = resp.json()
                    json["description"] = description
                    return json
            else:
                return JSONResponse({"error": "modelVersionId not found in Civitai URL."}, status_code=400)

        elif "huggingface" in domain:
            match = re.search(r'huggingface\.co/([^/]+)/([^/]+)', url)
            if not match:
                return JSONResponse({"error": "Invalid HuggingFace URL format."}, status_code=400)
            repo_id = f"{match.group(1)}/{match.group(2)}"

            card = ModelCard.load(repo_id)
            text = card.text
            if text:
                base_url_repo = f"https://huggingface.co/{repo_id}/"
                base_url_root = "https://huggingface.co/"

                def resolve_link(link, append_path=""):
                    if link.startswith("../") or link.startswith("./"):
                        return base_url_repo + link[2:]
                    elif link.startswith("/"):
                        return base_url_root + link[1:]
                    elif link.startswith("docs/"):
                        return base_url_repo + "resolve/main/" + link
                    else:
                        return base_url_repo + append_path + link

                def repl_md(m):
                    return f"[{m.group(1)}]({resolve_link(m.group(2))})"

                text = re.sub(r"\[([^\]]*)\]\((?!http|https|#)([^)]+)\)", repl_md, text)

                def repl_src(m):
                    return f"{m.group(1)}=\"{resolve_link(m.group(2))}\""

                text = re.sub(r"(src|href)=['\"](?!http|https|#|data:|mailto:)([^'\"]+)['\"]", repl_src, text)

                widget_data = getattr(card.data, 'widget', None)
                text = _expand_huggingface_gallery(text, widget_data, resolve_link)

            return {
                "description": text,
                "model": {"nsfw": False},
                "trainedWords": []
            }
        else:
            return JSONResponse({"error": "Unsupported URL domain."}, status_code=400)
    except Exception as e:
        logger.error("Failed to fetch info for %s: %s", request.url, e)
        return JSONResponse({"error": str(e)}, status_code=500)
