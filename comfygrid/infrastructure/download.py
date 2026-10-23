"""
Common utilities for downloading files with progress tracking.
"""

import io
import logging
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Callable

import httpx
from tqdm import tqdm

_download_activity: ContextVar[Callable[[bool], None] | None] = ContextVar("download_activity", default=None)


@contextmanager
def observe_downloads(callback: Callable[[bool], None]):
    token = _download_activity.set(callback)
    try:
        yield
    finally:
        _download_activity.reset(token)


def download_with_progress(url: str, desc: str, progress_callback: Callable[[int, int], None] = None) -> bytes:
    """
    Download a file from a URL, displaying a progress bar, and return the downloaded bytes.
    """
    callback = _download_activity.get()
    if callback:
        callback(True)
    try:
        return _download_with_progress(url, desc, progress_callback)
    finally:
        if callback:
            callback(False)


def _download_with_progress(url: str, desc: str, progress_callback: Callable[[int, int], None] = None) -> bytes:
    logging.info("Downloading %s from %s", desc, url)
    archive_bytes = io.BytesIO()

    with httpx.Client(timeout=300.0, follow_redirects=True) as client:
        with client.stream("GET", url) as response:
            response.raise_for_status()
            total_size = int(response.headers.get("Content-Length", 0))

            last_cb_time = 0
            with tqdm(total=total_size, unit="iB", unit_scale=True, desc=f"Downloading {desc}") as pbar:
                for chunk in response.iter_bytes(chunk_size=8192):
                    archive_bytes.write(chunk)
                    pbar.update(len(chunk))

                    if progress_callback:
                        now = time.time()
                        if now - last_cb_time > 0.1:
                            progress_callback(archive_bytes.tell(), total_size)
                            last_cb_time = now

            if progress_callback:
                progress_callback(total_size, total_size)

    return archive_bytes.getvalue()
