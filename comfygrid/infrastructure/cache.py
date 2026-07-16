import logging
from pathlib import Path

import lmdb

MAP_SIZE_UNIT = 10**7

thumbnail_cache_path = Path("cache", "thumbnail")
thumbnail_cache_env = None


def _get_thumbnail_cache_env():
    global thumbnail_cache_env
    if thumbnail_cache_env is not None:
        return thumbnail_cache_env

    thumbnail_cache_path.mkdir(parents=True, exist_ok=True)
    try:
        thumbnail_cache_env = lmdb.open(str(thumbnail_cache_path), map_size=MAP_SIZE_UNIT)
    except lmdb.Error as e:
        logging.warning("[Cache] Failed to open thumbnail cache: %s", e)
        return None
    return thumbnail_cache_env


def cache_thumbnail(key: str, buffer: bytes) -> None:
    env = _get_thumbnail_cache_env()
    if env is None:
        return

    try:
        with env.begin(write=True) as txn:
            txn.put(key.encode(), buffer)
    except lmdb.MapFullError:
        curr_size = env.info()["map_size"]
        new_size = curr_size + MAP_SIZE_UNIT
        logging.info("[Cache] LMDB Map full. Resizing cache to %s bytes", new_size)

        env.set_mapsize(new_size)
        with env.begin(write=True) as txn:
            txn.put(key.encode(), buffer)
    except lmdb.Error as e:
        logging.warning("[Cache] Failed to write thumbnail cache: %s", e)


def load_thumbnail(key: str):
    env = _get_thumbnail_cache_env()
    if env is None:
        return None

    try:
        with env.begin() as txn:
            data = txn.get(key.encode())
            if data:
                return data
    except lmdb.Error as e:
        logging.warning("[Cache] Failed to read thumbnail cache: %s", e)
    return None


def delete_thumbnail_cache(key: str) -> None:
    env = _get_thumbnail_cache_env()
    if env is None:
        return

    try:
        with env.begin(write=True) as txn:
            txn.delete(key.encode())
    except lmdb.Error as e:
        logging.warning("[Cache] Failed to delete thumbnail cache: %s", e)
