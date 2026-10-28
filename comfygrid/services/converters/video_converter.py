"""
Video metadata embedding and utility functions.
Uses mutagen for MP4 metadata and ffmpeg/ffprobe for other operations.
"""

import io
import logging
import os
import shutil
import subprocess
import tempfile
from typing import BinaryIO

import orjson
from mutagen.mp4 import MP4

from comfygrid.infrastructure.ffmpeg import find_ffmpeg, find_ffprobe

VIDEO_EXTENSIONS = {".webm", ".m4v", ".mp4", ".mkv", ".gif"}

METADATA_EMBEDDABLE_EXTENSIONS = {".mp4", ".m4v", ".mkv", ".webm"}
_MP4_EXTENSIONS = {".mp4", ".m4v"}
_METADATA_KEYS = ("prompt", "workflow", "comfygrid")


def is_video_file(filename: str) -> bool:
    """Check if a filename has a video extension."""
    ext = os.path.splitext(filename)[1].lower()
    return ext in VIDEO_EXTENSIONS


def embed_video_metadata(
    video_bytes: bytes,
    metadata: dict[str, str],
    extension: str = ".mp4",
) -> bytes:
    """
    Embed metadata into a video file using ffmpeg.
    For unsupported formats, returns the original bytes unchanged.

    Metadata is stored as:
        - comment: prompt JSON
        - description: workflow JSON

    Args:
        video_bytes: Original video bytes
        metadata: Dict with 'prompt' and/or 'workflow' keys
        extension: File extension to determine container format

    Returns:
        Video bytes with embedded metadata
    """
    if not metadata:
        return video_bytes

    ext = extension.lower()
    if ext not in METADATA_EMBEDDABLE_EXTENSIONS:
        return video_bytes

    prompt = metadata.get("prompt", "")
    workflow = metadata.get("workflow", "")
    if not prompt and not workflow:
        return video_bytes

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        logging.warning("ffmpeg not found, skipping video metadata embedding")
        return video_bytes

    input_path = None
    output_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_in:
            tmp_in.write(video_bytes)
            input_path = tmp_in.name

        output_path = input_path + ".out" + ext

        cmd = [
            ffmpeg, "-y", "-i", input_path,
            "-map_metadata", "0",
            "-c", "copy",
        ]
        if prompt:
            cmd.extend(["-metadata", f"comment={prompt}"])
        if workflow:
            cmd.extend(["-metadata", f"description={workflow}"])
        cmd.append(output_path)

        subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
            timeout=60,
        )

        with open(output_path, "rb") as f:
            return f.read()
    except Exception as e:
        logging.warning(f"Failed to embed video metadata: {e}")
        return video_bytes
    finally:
        for p in (input_path, output_path):
            if p and os.path.exists(p):
                os.unlink(p)


def _extract_video_metadata(tags: dict[str, str]) -> dict[str, str]:
    tags = {key.lower(): value for key, value in tags.items() if isinstance(value, str)}
    result = {key: tags[key] for key in _METADATA_KEYS if tags.get(key)}
    comment = tags.get("comment", "")
    comment_json = None
    try:
        comment_json = orjson.loads(comment)
    except orjson.JSONDecodeError:
        pass
    if isinstance(comment_json, dict):
        for key in _METADATA_KEYS:
            value = comment_json.get(key)
            if value is not None and key not in result:
                result[key] = value if isinstance(value, str) else orjson.dumps(value).decode()

    description = tags.get("description", "")
    try:
        description_json = orjson.loads(description)
    except orjson.JSONDecodeError:
        description_json = None
    if isinstance(description_json, (dict, list)):
        result.setdefault("workflow", description)
        # ComfyGrid writes the API prompt itself into comment, rather than a wrapper.
        if isinstance(comment_json, dict) and not any(key in comment_json for key in _METADATA_KEYS):
            result.setdefault("prompt", comment)
    return result


def _read_mp4_metadata(file_obj: BinaryIO) -> dict[str, str]:
    try:
        tags = MP4(file_obj).tags
        if not tags:
            return {}
        mapped = {}
        names = [("\xa9cmt", "comment"), ("desc", "description"), ("ldes", "description")]
        names.extend((f"----:com.apple.iTunes:{key}", key) for key in _METADATA_KEYS)
        for source, target in names:
            values = tags.get(source)
            if not values:
                continue
            value = values[0]
            if isinstance(value, bytes):
                value = value.decode("utf-8")
            if isinstance(value, str):
                mapped.setdefault(target, value)
        return _extract_video_metadata(mapped)
    except Exception:
        # Other MP4 tag layouts (such as mdta), or unreadable MP4s, use ffprobe.
        return {}


def read_video_metadata(video_path: str) -> dict[str, str]:
    """Read MP4 tags directly, with ffprobe as the compatibility fallback."""
    if os.path.splitext(video_path)[1].lower() in _MP4_EXTENSIONS:
        try:
            with open(video_path, "rb") as file_obj:
                metadata = _read_mp4_metadata(file_obj)
            if metadata:
                return metadata
        except OSError:
            pass
    return _read_video_metadata_with_ffprobe(video_path)


def _read_video_metadata_with_ffprobe(video_path: str) -> dict[str, str]:
    """
    Read metadata from a video file using ffprobe.

    Looks for 'comment' (prompt) and 'description' (workflow) tags.

    Returns:
        Dict with 'prompt' and/or 'workflow' keys
    """
    ffprobe = find_ffprobe()
    if not ffprobe:
        return {}

    try:
        cmd = [
            ffprobe, "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            video_path,
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=30,
        )
        if proc.returncode != 0:
            return {}

        info = orjson.loads(proc.stdout)
        tags = info.get("format", {}).get("tags", {})

        return _extract_video_metadata(tags)
    except Exception:
        return {}


def read_video_metadata_from_bytes(
    video_bytes: bytes,
) -> dict[str, str] | None:
    """Read metadata from bytes using the same fast path as uploaded files."""
    return read_video_metadata_from_file(io.BytesIO(video_bytes), "video.mp4")


def read_video_metadata_from_file(file_obj: BinaryIO, filename: str) -> dict[str, str] | None:
    """Read a seekable upload without copying the entire video into memory."""
    tmp_path = None
    position = file_obj.tell()
    try:
        ext = os.path.splitext(filename)[1].lower()
        file_obj.seek(0)
        if ext in _MP4_EXTENSIONS:
            metadata = _read_mp4_metadata(file_obj)
            if metadata:
                return metadata

        file_obj.seek(0)
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=ext if ext in VIDEO_EXTENSIONS else ".mp4"
        ) as tmp:
            tmp_path = tmp.name
            shutil.copyfileobj(file_obj, tmp, length=1024 * 1024)

        return _read_video_metadata_with_ffprobe(tmp_path)
    except Exception as e:
        logging.warning(f"Failed to read video metadata: {e}")
        return None
    finally:
        try:
            file_obj.seek(position)
        except (OSError, ValueError):
            pass
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
