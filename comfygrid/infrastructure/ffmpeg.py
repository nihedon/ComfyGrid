"""
FFmpeg download and installation utilities.
Downloads a portable FFmpeg build into the project's bin directory.
"""
import io
import logging
import os
import shutil
import zipfile
from pathlib import Path
from typing import Callable

from comfygrid.infrastructure.download import download_with_progress


def get_ffmpeg_path(bin_dir: Path) -> Path | None:
    """Return the path to ffmpeg executable if it exists in bin_dir."""
    if os.name == "nt":
        ffmpeg = bin_dir / "ffmpeg.exe"
    else:
        ffmpeg = bin_dir / "ffmpeg"

    if ffmpeg.is_file():
        return ffmpeg
    return None


def _find_executable(name: str) -> str | None:
    """Find an executable in the project bin dir first, then system PATH."""
    bin_dir = Path("bin", "ffmpeg")
    exe_name = f"{name}.exe" if os.name == "nt" else name

    local = bin_dir / exe_name
    if local.is_file():
        return str(local.resolve())

    return shutil.which(name)


def find_ffmpeg() -> str | None:
    """Find the ffmpeg executable."""
    return _find_executable("ffmpeg")


def find_ffprobe() -> str | None:
    """Find the ffprobe executable."""
    return _find_executable("ffprobe")


def ensure_ffmpeg(url: str, bin_dir: Path, progress_callback: Callable[[int, int], None] = None) -> Path:
    """
    Ensure ffmpeg is available in bin_dir.
    Downloads and extracts from the given URL if not already present.

    Returns:
        Path to the ffmpeg executable.
    """
    existing = get_ffmpeg_path(bin_dir)
    if existing:
        logging.info(f"ffmpeg already installed: {existing}")
        return existing

    logging.info(f"ffmpeg not found in {bin_dir}, downloading...")
    bin_dir.mkdir(parents=True, exist_ok=True)

    return _download_and_extract_ffmpeg(url, bin_dir, progress_callback)


def _download_and_extract_ffmpeg(url: str, bin_dir: Path, progress_callback: Callable[[int, int], None] = None) -> Path:
    """Download ffmpeg zip and extract binaries to bin_dir."""
    content = download_with_progress(url, "ffmpeg", progress_callback)
    zip_bytes = io.BytesIO(content)

    target_names = {"ffmpeg.exe", "ffprobe.exe"} if os.name == "nt" else {"ffmpeg", "ffprobe"}
    extracted = []

    with zipfile.ZipFile(zip_bytes) as zf:
        for entry in zf.namelist():
            basename = Path(entry).name
            if basename in target_names:
                dest = bin_dir / basename
                with zf.open(entry) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)

                if os.name != "nt":
                    dest.chmod(dest.stat().st_mode | stat.S_IEXEC)

                extracted.append(dest)
                logging.info(f"Extracted {basename} -> {dest}")

    if not extracted:
        raise RuntimeError(
            f"Could not find ffmpeg binaries in the downloaded archive from {url}"
        )

    ffmpeg_path = get_ffmpeg_path(bin_dir)
    if ffmpeg_path is None:
        raise RuntimeError("ffmpeg was not found after extraction")

    logging.info(f"ffmpeg installed successfully: {ffmpeg_path}")
    return ffmpeg_path
