"""
Video metadata embedding and utility functions.
Uses ffmpeg/ffprobe for metadata operations.
"""

import logging
import os
import subprocess
import tempfile

import orjson

from comfygrid.infrastructure.ffmpeg import find_ffmpeg, find_ffprobe

VIDEO_EXTENSIONS = {".webm", ".m4v", ".mp4", ".mkv", ".gif"}

METADATA_EMBEDDABLE_EXTENSIONS = {".mp4", ".m4v", ".mkv", ".webm"}


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


def read_video_metadata(video_path: str) -> dict[str, str]:
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

        result = {}

        prompt = tags.get("prompt", None)
        if prompt:
            result["prompt"] = prompt

        workflow = tags.get("workflow", None)
        if workflow:
            result["workflow"] = workflow

        if not workflow and not prompt:
            comment = tags.get("COMMENT", None) or tags.get("comment", None)
            if comment:
                comment_json = orjson.loads(comment)
                result["workflow"] = orjson.dumps(comment_json["workflow"]).decode()
                result["prompt"] = orjson.dumps(comment_json["prompt"]).decode()

        return result
    except Exception:
        return {}


def read_video_metadata_from_bytes(
    video_bytes: bytes,
) -> dict[str, str] | None:
    """
    Read metadata from video bytes using ffprobe.

    Args:
        video_bytes: Raw video bytes

    Returns:
        Dict with 'prompt' and/or 'workflow' keys
    """
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=".mp4"
        ) as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name

        return read_video_metadata(tmp_path)
    except Exception as e:
        logging.warning(f"Failed to read video metadata: {e}")
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
