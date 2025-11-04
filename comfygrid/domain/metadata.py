"""
Metadata embedding utilities for image and video files.
Supports PNG text chunks, EXIF data (WebP, JPEG, JXL), and MP4 tags.
"""

import piexif
from PIL import PngImagePlugin


def build_image_metadata_kwargs(target_format: str, metadata: dict[str, str]) -> dict:
    """Build PIL save kwargs for embedding metadata."""
    if target_format == "png":
        return _build_png_metadata_kwargs(metadata)
    elif target_format in ("webp", "jpeg", "jxl"):
        return _build_exif_metadata_kwargs(metadata)
    return {}


def _build_png_metadata_kwargs(metadata: dict[str, str]) -> dict:
    """Create PNG text chunks for metadata."""
    pnginfo = PngImagePlugin.PngInfo()

    if "prompt" in metadata:
        pnginfo.add_text("prompt", metadata["prompt"])
    if "workflow" in metadata:
        pnginfo.add_text("workflow", metadata["workflow"])

    return {"pnginfo": pnginfo}


def _build_exif_metadata_kwargs(metadata: dict[str, str]) -> dict:
    """Create EXIF data for metadata (WebP, JPEG, JXL)."""
    exif_dict = {
        "0th": {},
        "Exif": {},
        "GPS": {},
        "1st": {},
    }

    if "prompt" in metadata:
        exif_dict["0th"][piexif.ImageIFD.Make] = ("Prompt: " + metadata["prompt"]).encode("utf-8")
    if "workflow" in metadata:
        exif_dict["0th"][piexif.ImageIFD.ImageDescription] = ("Workflow: " + metadata["workflow"]).encode("utf-8")

    return {"exif": piexif.dump(exif_dict)}
