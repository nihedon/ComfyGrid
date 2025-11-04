import io
import os
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import cv2
import numpy as np
import orjson
import PIL.Image as Image

from comfygrid.domain import state
from comfygrid.domain.image import get_metadata, resize_with_aspect_ratio
from comfygrid.services.converters.image_converter import convert_image
from comfygrid.services.converters.video_converter import (
    embed_video_metadata, is_video_file, read_video_metadata_from_bytes)


def build_download_media(url: str, image_info: dict) -> tuple[bytes | None, str | None]:
    image_info = complement_image_info(image_info)
    bin_data = fetch_bytes(url)
    if bin_data is None:
        return None, None

    filename = parse_qs(urlparse(url).query)["filename"][0]
    metadata = extract_workflow_metadata(image_info)

    if is_video_file(filename):
        ext = os.path.splitext(filename)[1].lower()
        if metadata:
            bin_data = embed_video_metadata(bin_data, metadata, ext)
        return bin_data, format_image_filename(filename, image_info, ext)

    target_format = state.opts.data.get("save_image_format", "original")
    quality = int(state.opts.data.get("save_image_quality", 90))
    bin_data, ext = convert_image(bin_data, target_format, quality, metadata)
    return bin_data, format_image_filename(filename, image_info, ext)


def save_media(url: str, image_info: dict, output_dir: Path) -> bool:
    bin_data, out_filename = build_download_media(url, image_info)
    if bin_data is None or out_filename is None:
        return False

    dir_path = make_directory(output_dir, complement_image_info(image_info))
    with open(dir_path / out_filename, "wb") as f:
        f.write(bin_data)
    return True


def read_uploaded_media_metadata(filename: str, file_obj) -> dict | None:
    if is_video_file(filename):
        return read_video_metadata_from_bytes(file_obj.file.read())
    return get_metadata(file_obj)


def resize_image_from_url(url: str, size: int) -> bytes | None:
    image_bytes = fetch_bytes(url)
    if image_bytes is None:
        return None
    return resize_image(image_bytes, size)


def video_thumbnail_from_url(url: str, size: int) -> bytes | None:
    video_bytes = fetch_bytes(url)
    if video_bytes is None:
        return None
    return video_thumbnail(video_bytes, size)


def fetch_bytes(url: str) -> bytes | None:
    try:
        with urllib.request.urlopen(url) as response:
            return response.read()
    except Exception:
        return None


def format_image_filename(url: str, image_info: dict, ext_override: str | None = None) -> str:
    ext = ext_override if ext_override else os.path.splitext(url)[1].lower()
    batch_job_index = int(image_info.get("batchJobIndex", "0"))
    suffix = "_" + str(batch_job_index) if batch_job_index else ""
    try:
        template = state.opts.data.get("save_image_filename_format", "[{ckpt_name}]_{datetime}_({seed})")
        return template.format(**image_info) + suffix + ext
    except Exception:
        basename = os.path.splitext(os.path.basename(url))[0]
        return basename + suffix + ext


def extract_workflow_metadata(image_info: dict) -> dict[str, str] | None:
    if not state.opts.data.get("save_image_embed_metadata", True):
        return None

    metadata = {}
    if "prompt" in image_info:
        metadata["prompt"] = image_info["prompt"]
    if "workflow" in image_info:
        metadata["workflow"] = image_info["workflow"]
    return metadata if metadata else None


def resize_image(image_bytes: bytes, size: int) -> bytes | None:
    try:
        img_pil = Image.open(io.BytesIO(image_bytes))
        img_array = np.array(img_pil)
        img = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        img_resized = resize_with_aspect_ratio(img, size)
        ok, buffer = cv2.imencode(".jpg", img_resized)
        if not ok:
            return None
        return buffer.tobytes()
    except Exception:
        return None


def video_thumbnail(video_bytes: bytes, size: int) -> bytes | None:
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name

        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            return None

        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            return None

        frame_resized = resize_with_aspect_ratio(frame, size)
        ok, buffer = cv2.imencode(".jpg", frame_resized)
        if not ok:
            return None
        return buffer.tobytes()
    except Exception:
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def get_datetime(image_info: dict) -> datetime:
    str_datetime = image_info.get("datetime", "")
    if str_datetime:
        dt_utc = datetime.strptime(str_datetime, "%Y-%m-%dT%H:%M:%S.%fZ")
        return dt_utc.replace(tzinfo=timezone.utc).astimezone().replace(tzinfo=None)
    return datetime.now()


def make_directory(output_dir: Path, image_info: dict) -> Path:
    save_dir = state.opts.data.get("save_directory", "save")
    if state.opts.data.get("create_subdirectory", True):
        template = state.opts.data.get("subdirectory_name_format", "{date}")
        subdir = template.format(**image_info)
        save_dir = output_dir / save_dir / subdir
    else:
        save_dir = output_dir / save_dir
    save_dir.mkdir(exist_ok=True)
    return save_dir


def complement_image_info(image_info: dict) -> dict:
    image_info = dict(image_info)
    dt = get_datetime(image_info)
    image_info["ckpt_name"] = os.path.splitext(os.path.basename(image_info.get("ckpt_name", "")))[0]
    image_info["seed"] = image_info.get("seed", "")
    image_info["date"] = datetime.strftime(dt, "%Y-%m-%d")
    image_info["datetime"] = datetime.strftime(dt, "%Y%m%d%H%M%S")
    return image_info


def parse_form_json(form: str | None) -> dict:
    return orjson.loads(form) if form else {}
