"""
Image format conversion utilities.
Supports PNG, WebP, JPEG, and JPEG-XL.
"""

import io

from PIL import Image

from comfygrid.domain.metadata import build_image_metadata_kwargs

try:
    import pillow_jxl  # noqa: F401 - registers JXL plugin
    JXL_SUPPORTED = True
except ImportError:
    JXL_SUPPORTED = False


IMAGE_FORMAT_EXTENSIONS = {
    "png": ".png",
    "webp": ".webp",
    "jpeg": ".jpg",
    "jxl": ".jxl",
}


def convert_image(
    image_bytes: bytes,
    target_format: str,
    quality: int = 90,
    metadata: dict[str, str] | None = None,
) -> tuple[bytes, str]:
    """
    Convert image to target format with optional metadata embedding.

    Args:
        image_bytes: Original image bytes
        target_format: Target format (png, webp, jpeg, jxl, original)
        quality: Compression quality (1-100) for lossy formats
        metadata: Dict with 'prompt' and/or 'workflow' keys to embed

    Returns:
        Tuple of (converted image bytes, file extension)
    """
    if target_format == "original":
        return image_bytes, _detect_image_extension(image_bytes)

    if target_format == "jxl" and not JXL_SUPPORTED:
        print("[ComfyGrid] Warning: JXL not supported, falling back to PNG")
        target_format = "png"

    img = Image.open(io.BytesIO(image_bytes))

    if img.mode == "RGBA" and target_format in ("jpeg",):
        img = img.convert("RGB")

    output = io.BytesIO()
    ext = IMAGE_FORMAT_EXTENSIONS.get(target_format, ".png")

    save_kwargs = _get_image_save_kwargs(target_format, quality)

    if metadata and target_format != "jpeg":
        save_kwargs.update(build_image_metadata_kwargs(target_format, metadata))

    img.save(output, format=_get_pil_format(target_format), **save_kwargs)
    return output.getvalue(), ext


def _detect_image_extension(image_bytes: bytes) -> str:
    """Detect image format from bytes and return extension."""
    img = Image.open(io.BytesIO(image_bytes))
    fmt = img.format.lower() if img.format else "png"
    return IMAGE_FORMAT_EXTENSIONS.get(fmt, f".{fmt}")


def _get_pil_format(target_format: str) -> str:
    """Convert target format to PIL format name."""
    return {
        "png": "PNG",
        "webp": "WEBP",
        "jpeg": "JPEG",
        "jxl": "JXL",
    }.get(target_format, "PNG")


def _get_image_save_kwargs(target_format: str, quality: int) -> dict:
    """Get format-specific save kwargs."""
    kwargs = {}

    if target_format == "png":
        kwargs["compress_level"] = 6
    elif target_format == "webp":
        kwargs["quality"] = quality
        kwargs["method"] = 4
    elif target_format == "jpeg":
        kwargs["quality"] = quality
        kwargs["optimize"] = True
    elif target_format == "jxl":
        kwargs["lossless"] = True

    return kwargs
