"""
Caddy reverse proxy download, installation, and lifecycle utilities.
"""
import io
import logging
import os
import shutil
import signal
import stat
import subprocess
import tarfile
import zipfile
from pathlib import Path
from typing import Callable

from comfygrid.infrastructure.download import download_with_progress


def _caddy_exe_name() -> str:
    return "caddy.exe" if os.name == "nt" else "caddy"


def get_caddy_path(bin_dir: Path) -> Path | None:
    caddy = bin_dir / _caddy_exe_name()
    if caddy.is_file():
        return caddy
    return None


def _resolve_download_url(caddy_config: dict) -> str:
    if os.name == "nt":
        return caddy_config.get("url_windows", "")
    system = os.uname().sysname.lower()
    if system == "darwin":
        return caddy_config.get("url_macos", "")
    return caddy_config.get("url_linux", "")


def ensure_caddy(caddy_config: dict, progress_callback: Callable[[int, int], None] = None) -> Path:
    """
    Ensure the Caddy binary exists in bin_dir.
    Downloads and extracts from the platform-appropriate URL if not present.

    Returns:
        Path to the caddy executable.
    """
    bin_dir = Path(caddy_config.get("bin_dir", "bin/caddy"))
    existing = get_caddy_path(bin_dir)
    if existing:
        logging.info("Caddy already installed: %s", existing)
        return existing

    url = _resolve_download_url(caddy_config)
    if not url:
        raise RuntimeError("No Caddy download URL configured for this platform")

    logging.info("Caddy not found in %s, downloading...", bin_dir)
    bin_dir.mkdir(parents=True, exist_ok=True)

    return _download_and_extract_caddy(url, bin_dir, progress_callback)


def _download_and_extract_caddy(url: str, bin_dir: Path, progress_callback: Callable[[int, int], None] = None) -> Path:
    content = download_with_progress(url, "Caddy", progress_callback)

    exe_name = _caddy_exe_name()

    if url.endswith(".zip"):
        _extract_from_zip(content, exe_name, bin_dir)
    else:
        _extract_from_targz(content, exe_name, bin_dir)

    caddy_path = get_caddy_path(bin_dir)
    if caddy_path is None:
        raise RuntimeError("Caddy binary not found after extraction")

    logging.info("Caddy installed successfully: %s", caddy_path)
    return caddy_path


def _extract_from_zip(content: bytes, exe_name: str, bin_dir: Path) -> None:
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for entry in zf.namelist():
            if Path(entry).name == exe_name:
                dest = bin_dir / exe_name
                with zf.open(entry) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                _make_executable(dest)
                logging.info("Extracted %s -> %s", exe_name, dest)
                return
    raise RuntimeError(f"Could not find {exe_name} in downloaded archive")


def _extract_from_targz(content: bytes, exe_name: str, bin_dir: Path) -> None:
    with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as tf:
        for member in tf.getmembers():
            if Path(member.name).name == exe_name:
                dest = bin_dir / exe_name
                with tf.extractfile(member) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                _make_executable(dest)
                logging.info("Extracted %s -> %s", exe_name, dest)
                return
    raise RuntimeError(f"Could not find {exe_name} in downloaded archive")


def _make_executable(path: Path) -> None:
    if os.name != "nt":
        path.chmod(path.stat().st_mode | stat.S_IEXEC)


_caddy_process: subprocess.Popen | None = None


def start_caddy(caddy_path: Path, caddyfile: Path) -> None:
    """Start Caddy as a background subprocess."""
    global _caddy_process

    stop_caddy()

    logging.info("Starting Caddy: %s --config %s", caddy_path, caddyfile)
    _caddy_process = subprocess.Popen(
        [str(caddy_path), "run", "--config", str(caddyfile)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    logging.info("Caddy started (PID: %d)", _caddy_process.pid)


def stop_caddy() -> None:
    """Stop the Caddy subprocess if it is running."""
    global _caddy_process

    if _caddy_process is None:
        return

    if _caddy_process.poll() is None:
        logging.info("Stopping Caddy (PID: %d)", _caddy_process.pid)
        if os.name == "nt":
            _caddy_process.terminate()
        else:
            _caddy_process.send_signal(signal.SIGTERM)
        try:
            _caddy_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _caddy_process.kill()

    _caddy_process = None
