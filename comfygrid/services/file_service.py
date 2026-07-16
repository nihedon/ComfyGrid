import base64
import io
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from tqdm import tqdm

import cv2
import numpy as np
from charset_normalizer import from_path
from PIL import Image

from comfygrid.domain.image import resize_with_crop
from comfygrid.infrastructure import model_repository
from comfygrid.infrastructure.cache import cache_thumbnail, load_thumbnail

logger = logging.getLogger(__name__)

_model_cache: dict[tuple, tuple[float, list[dict]]] = {}
CACHE_TTL_SECONDS = 30


def clear_model_cache(comfyui_path: Path, dir_name: str) -> None:
    target_path = str(comfyui_path / dir_name)
    keys_to_remove = [k for k in _model_cache if k[0] == target_path]
    for k in keys_to_remove:
        _model_cache.pop(k, None)


def list_models(comfyui_path: Path, dir_name: str, extensions: list[str]) -> list[dict]:
    cache_key = (str(comfyui_path / dir_name), tuple(sorted(extensions)))
    if cache_key in _model_cache:
        cached_time, cached_result = _model_cache[cache_key]
        if (time.time() - cached_time) < CACHE_TTL_SECONDS:
            return cached_result

    return _get_models(comfyui_path, dir_name, extensions)


def _get_models(comfyui_path: Path, dir_name: str, extensions: list[str]) -> list[dict]:
    model_path = comfyui_path / dir_name
    if not os.path.isdir(model_path):
        return []

    model_info_list = []
    seen_abs_paths: set[str] = set()
    futures = []

    with ThreadPoolExecutor() as executor:
        for root, _, files in os.walk(model_path, followlinks=True):
            if dir_name == "models":
                if root == str(model_path):
                    continue

                relative = Path(root).relative_to(comfyui_path)
                sub_dir = relative.parts[1]
            else:
                sub_dir = ""

            for filename in files:
                if any(filename.endswith(e) for e in extensions):
                    abs_path = str(Path(root, filename).resolve())
                    if abs_path in seen_abs_paths:
                        continue
                    seen_abs_paths.add(abs_path)
                    futures.append(
                        executor.submit(_make_model_info, root, filename, dir_name, sub_dir, model_path)
                    )

        for future in tqdm(as_completed(futures), total=len(futures), desc=f"Loading {dir_name}", unit="file"):
            model_info_list.append(future.result())

    cache_key = (str(model_path), tuple(sorted(extensions)))
    _model_cache[cache_key] = (time.time(), model_info_list)
    return model_info_list


def _make_model_info(root: str, filename: str, dir_name: str, sub_dir: str, model_path: Path) -> dict:
    model_info = {}
    rel_dir = os.path.relpath(root, model_path)
    if rel_dir == ".":
        rel_dir = ""

    if dir_name == "models":
        model_rel_dir = os.path.relpath(root, model_path / sub_dir)
        if model_rel_dir == ".":
            model_rel_dir = ""
    else:
        model_rel_dir = rel_dir

    model_info["path"] = str(Path(model_rel_dir, filename))
    model_info["full_path"] = str(Path(dir_name, rel_dir, filename))
    model_info["category"] = sub_dir
    name_without_ext = os.path.splitext(filename)[0]
    model_info["name"] = name_without_ext
    model_info["extension"] = os.path.splitext(filename)[1]

    full_path = Path(root, filename)
    model_info["modified"] = os.path.getmtime(full_path)
    model_info["created"] = os.path.getctime(full_path)
    model_info["size"] = os.path.getsize(full_path)

    if dir_name != "models":
        return model_info

    preview = name_without_ext + ".preview.png"
    if Path(root, preview).exists():
        model_info["preview"] = str(Path(rel_dir, preview))

    description_path = Path(root, name_without_ext + ".description.txt")
    model_info["description"] = None
    model_info["has_description"] = description_path.exists()

    model_info["metadata"] = {}

    db_meta = model_repository.get_model_meta(model_info["full_path"])
    if db_meta is not None:
        model_info["url"] = db_meta.url
        model_info["nsfw"] = db_meta.nsfw
        model_info["rate"] = db_meta.rate
        model_info["favorite"] = db_meta.favorite
        model_info["trainedWords"] = db_meta.trained_words
    else:
        url = None
        nsfw = False
        trained_words = []
        metadata_path = Path(root, name_without_ext + ".civitai.info")
        if metadata_path.exists():
            try:
                import orjson
                content = _read_file(metadata_path)
                if content:
                    civitai_info = orjson.loads(content.replace("¥", "\\"))

                    id = civitai_info.get("id", None)
                    model_id = civitai_info.get("modelId", None)
                    if id is not None and model_id is not None and "downloadUrl" in civitai_info:
                        download_url = civitai_info["downloadUrl"]
                        parts = urlsplit(download_url)
                        site_url = urlunsplit((parts.scheme, parts.netloc, "/", "", ""))
                        url = f"{site_url}/models/{model_id}/?modelVersionId={id}"

                    nsfw = bool(civitai_info.get("model", {}).get("nsfw", False))
                    raw_words = civitai_info.get("trainedWords") or civitai_info.get("trainedWord") or []
                    trained_words = raw_words if isinstance(raw_words, list) else []
            except Exception:
                pass

        try:
            model_repository.upsert_model_meta(
                model_info["full_path"],
                url=url,
                nsfw=nsfw,
                rate=None,
                favorite=False,
                trained_words=trained_words,
            )
        except Exception as e:
            logger.error("Failed to insert initial model meta to DB for %s: %s", model_info["full_path"], e)

        model_info["url"] = url
        model_info["nsfw"] = nsfw
        model_info["rate"] = None
        model_info["favorite"] = False
        model_info["trainedWords"] = trained_words

    return model_info


def _read_file(file_path: Path) -> str | None:
    try:
        results = from_path(file_path)
        best_guess = results.best()
        if best_guess is not None:
            return str(best_guess)

        return file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        logger.error("Error processing file %s: %s", file_path, e)
        return None


def has_unsafe_path_fragment(path: str | None) -> bool:
    return bool(path and ".." in path)


def resolve_file_path(comfyui_path: str, file_path: str) -> Path | None:
    if has_unsafe_path_fragment(file_path):
        return None

    if file_path.startswith("models/"):
        path = Path(comfyui_path, file_path)
    else:
        path = Path(file_path)

    return path if path.is_file() else None


def resolve_output_path(output_directory: str, file_path: str) -> Path | None:
    if has_unsafe_path_fragment(file_path):
        return None

    output_dir = Path(output_directory)
    output_path = output_dir / file_path
    if output_path.is_file():
        return output_path

    temp_path = output_dir.parent / "temp" / file_path
    return temp_path if temp_path.is_file() else None


def get_model_thumbnail(comfyui_path: str, path: str) -> tuple[bytes | None, str | None]:
    thumbnail_filepath = Path(comfyui_path, "models", path)

    cached = load_thumbnail(str(thumbnail_filepath))
    if cached is not None:
        return cached, None

    if not thumbnail_filepath.exists():
        return None, "File not found"

    try:
        data = np.fromfile(thumbnail_filepath, dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    except Exception as e:
        logger.error("Failed to read image: %s: %s", thumbnail_filepath, e)
        return None, "Failed to read image"

    if img is None:
        logger.error("Failed to read image: %s", thumbnail_filepath)
        return None, "Failed to read image"

    resized = resize_with_crop(img, 210, 280)

    if len(resized.shape) == 3:
        if resized.shape[2] == 4:
            pil_img = Image.fromarray(cv2.cvtColor(resized, cv2.COLOR_BGRA2RGBA))
        else:
            pil_img = Image.fromarray(cv2.cvtColor(resized, cv2.COLOR_BGR2RGB))
    else:
        pil_img = Image.fromarray(resized)

    output = io.BytesIO()
    pil_img.save(output, format="WEBP", quality=70, method=4)
    buffer = output.getvalue()

    cache_thumbnail(str(thumbnail_filepath), buffer)
    return buffer, None


def process_image_for_paint(image_bytes: bytes) -> dict:
    img = Image.open(io.BytesIO(image_bytes))
    original_mode = img.mode
    mask_img = Image.new("L", img.size, 0)

    if img.mode == "RGBA":
        r_ch, g_ch, b_ch, a_ch = img.split()
        mask_img = Image.eval(a_ch, lambda x: 255 - x)
        img = Image.merge("RGBA", (r_ch, g_ch, b_ch, Image.new("L", img.size, 255)))
    elif img.mode == "LA":
        l_ch, a_ch = img.split()
        mask_img = Image.eval(a_ch, lambda x: 255 - x)
        img = Image.merge("LA", (l_ch, Image.new("L", img.size, 255)))
    elif img.mode == "P" and "transparency" in img.info:
        img = img.convert("RGBA")
        r_ch, g_ch, b_ch, a_ch = img.split()
        mask_img = Image.eval(a_ch, lambda x: 255 - x)
        img = Image.merge("RGBA", (r_ch, g_ch, b_ch, Image.new("L", img.size, 255)))

    img_buffer = io.BytesIO()
    img.save(img_buffer, format="PNG")
    mask_buffer = io.BytesIO()
    mask_img.save(mask_buffer, format="PNG")

    return {
        "image": f"data:image/png;base64,{base64.b64encode(img_buffer.getvalue()).decode('utf-8')}",
        "mask": f"data:image/png;base64,{base64.b64encode(mask_buffer.getvalue()).decode('utf-8')}",
        "width": img.size[0],
        "height": img.size[1],
        "had_alpha": original_mode in ("RGBA", "LA") or (original_mode == "P" and "transparency" in img.info),
    }


def apply_mask(img_bytes: bytes, mask_bytes: bytes, save_path: Path) -> None:
    img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    mask_img = Image.open(io.BytesIO(mask_bytes)).convert("L")

    if mask_img.size != img.size:
        mask_img = mask_img.resize(img.size)

    alpha = Image.eval(mask_img, lambda x: 255 - x)
    img.putalpha(alpha)
    img.save(save_path, format="PNG")


def resolve_image_delete_path(
    comfyui_path: str,
    output_directory: str,
    image_type: str,
    filename: str,
    subfolder: str | None,
) -> tuple[Path | None, str | None]:
    if has_unsafe_path_fragment(filename) or has_unsafe_path_fragment(subfolder):
        return None, "Invalid path"

    if image_type == "input":
        root_dir = Path(comfyui_path, "input")
    elif image_type == "output":
        root_dir = Path(output_directory)
    elif image_type == "temp":
        root_dir = Path(output_directory, "..", "temp")
    else:
        return None, "Invalid type"

    target_dir = root_dir / subfolder if subfolder else root_dir
    return target_dir / filename, None
