import logging
import sqlite3
import threading
import time
import zlib
from pathlib import Path
from typing import Any, Dict

import orjson

JOBS_DB = Path("cache", "jobs.db")
_local = threading.local()

_ONE_DAY_SECONDS = 86400
_CLEANUP_INTERVAL_SECONDS = 3600
_cleanup_lock = threading.Lock()
_next_cleanup_at = 0.0
logger = logging.getLogger(__name__)

_CREATE_TABLE_SQL = (
    "CREATE TABLE IF NOT EXISTS jobs"
    " (job_id TEXT PRIMARY KEY, data BLOB NOT NULL, created_at INTEGER NOT NULL)"
)
_CREATE_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at)"
)


def _get_connection() -> sqlite3.Connection:
    if not hasattr(_local, "conn"):
        JOBS_DB.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(JOBS_DB), check_same_thread=False, timeout=10.0)
        conn.execute(_CREATE_TABLE_SQL)
        conn.execute(_CREATE_INDEX_SQL)
        conn.commit()
        _local.conn = conn
    return _local.conn


def _prune_expired_jobs(conn: sqlite3.Connection, *, force: bool = False) -> None:
    global _next_cleanup_at
    now = time.monotonic()
    if not force and now < _next_cleanup_at:
        return

    with _cleanup_lock:
        if not force and now < _next_cleanup_at:
            return
        try:
            conn.execute("DELETE FROM jobs WHERE created_at < ?", (int(time.time()) - _ONE_DAY_SECONDS,))
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            logger.warning("Failed to prune expired job cache", exc_info=True)
        finally:
            _next_cleanup_at = now + _CLEANUP_INTERVAL_SECONDS


def initialize() -> None:
    _prune_expired_jobs(_get_connection(), force=True)


def set_job(job_id: str, data: Any) -> None:
    conn = _get_connection()
    _prune_expired_jobs(conn)
    conn.execute(
        "INSERT OR REPLACE INTO jobs (job_id, data, created_at) VALUES (?, ?, ?)",
        (job_id, zlib.compress(orjson.dumps(data)), int(time.time())),
    )
    conn.commit()


def get_job(job_id: str) -> Any:
    conn = _get_connection()
    _prune_expired_jobs(conn)
    row = conn.execute(
        "SELECT data FROM jobs WHERE job_id = ? AND created_at >= ?",
        (job_id, int(time.time()) - _ONE_DAY_SECONDS),
    ).fetchone()
    if row is None:
        return None
    return orjson.loads(zlib.decompress(row[0]))


def get_all_jobs() -> Dict[str, Any]:
    conn = _get_connection()
    _prune_expired_jobs(conn)
    # Filter in SQL even between cleanup runs, before loading and decompressing blobs.
    rows = conn.execute(
        "SELECT job_id, data FROM jobs WHERE created_at >= ?",
        (int(time.time()) - _ONE_DAY_SECONDS,),
    ).fetchall()
    return {job_id: orjson.loads(zlib.decompress(data)) for job_id, data in rows}


def patch_job(job_id: str, partial: Dict[str, Any]) -> bool:
    conn = _get_connection()
    _prune_expired_jobs(conn)
    row = conn.execute(
        "SELECT data FROM jobs WHERE job_id = ? AND created_at >= ?",
        (job_id, int(time.time()) - _ONE_DAY_SECONDS),
    ).fetchone()
    if row is None:
        merged = {"jobId": job_id, **partial}
    else:
        merged = {**orjson.loads(zlib.decompress(row[0])), **partial}
    conn.execute(
        "INSERT OR REPLACE INTO jobs (job_id, data, created_at) VALUES (?, ?, ?)",
        (job_id, zlib.compress(orjson.dumps(merged)), int(time.time())),
    )
    conn.commit()
    return True
