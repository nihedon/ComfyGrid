import logging
import threading
from pathlib import Path

import lmdb

# 128 MB initial map size (reasonable file size for disk storage)
INITIAL_MAP_SIZE = 128 * 1024 * 1024
MAP_SIZE_INCREMENT = 64 * 1024 * 1024

thumbnail_cache_path = Path("cache", "thumbnail")
thumbnail_cache_env: lmdb.Environment | None = None
_env_lock = threading.RLock()


def _get_thumbnail_cache_env() -> lmdb.Environment | None:
    global thumbnail_cache_env
    if thumbnail_cache_env is not None:
        return thumbnail_cache_env

    with _env_lock:
        if thumbnail_cache_env is not None:
            return thumbnail_cache_env

        thumbnail_cache_path.mkdir(parents=True, exist_ok=True)
        try:
            thumbnail_cache_env = lmdb.open(
                str(thumbnail_cache_path),
                map_size=INITIAL_MAP_SIZE,
                max_dbs=1,
                sync=False,
            )
        except lmdb.Error as e:
            logging.warning("[Cache] Failed to open thumbnail cache: %s", e)
            return None
        return thumbnail_cache_env


def cache_thumbnail(key: str, buffer: bytes) -> None:
    env = _get_thumbnail_cache_env()
    if env is None:
        return

    with _env_lock:
        try:
            with env.begin(write=True) as txn:
                txn.put(key.encode(), buffer)
        except lmdb.MapFullError:
            try:
                curr_size = env.info()["map_size"]
                new_size = curr_size + MAP_SIZE_INCREMENT
                logging.info("[Cache] LMDB Map full. Resizing cache to %s bytes", new_size)
                env.set_mapsize(new_size)
                with env.begin(write=True) as txn:
                    txn.put(key.encode(), buffer)
            except Exception as e:
                logging.warning("[Cache] Failed to resize/write thumbnail cache: %s", e)
        except Exception as e:
            logging.warning("[Cache] Failed to write thumbnail cache: %s", e)


def load_thumbnail(key: str) -> bytes | None:
    env = _get_thumbnail_cache_env()
    if env is None:
        return None

    with _env_lock:
        try:
            with env.begin() as txn:
                data = txn.get(key.encode())
                if data:
                    return bytes(data)
        except Exception as e:
            logging.warning("[Cache] Failed to read thumbnail cache: %s", e)
        return None


def delete_thumbnail_cache(key: str) -> None:
    env = _get_thumbnail_cache_env()
    if env is None:
        return

    with _env_lock:
        try:
            with env.begin(write=True) as txn:
                txn.delete(key.encode())
        except Exception as e:
            logging.warning("[Cache] Failed to delete thumbnail cache: %s", e)
