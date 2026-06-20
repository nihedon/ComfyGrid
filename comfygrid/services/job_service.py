import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict

JOBS_FILE = Path("cache", "jobs.json")
_lock = threading.Lock()


def load_jobs() -> Dict[str, Any]:
    if not JOBS_FILE.exists():
        return {}
    try:
        with open(JOBS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logging.warning("[JobService] Failed to load jobs: %s", e)
        return {}


def save_jobs(jobs: Dict[str, Any]):
    try:
        JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(JOBS_FILE, "w", encoding="utf-8") as f:
            json.dump(jobs, f, ensure_ascii=False)
    except Exception as e:
        logging.warning("[JobService] Failed to save jobs: %s", e)


def set_job(job_id: str, data: Any):
    with _lock:
        jobs = load_jobs()
        jobs[job_id] = data
        save_jobs(jobs)


def get_job(job_id: str) -> Any:
    with _lock:
        jobs = load_jobs()
        return jobs.get(job_id)


def get_all_jobs() -> Dict[str, Any]:
    with _lock:
        return load_jobs()


def patch_job(job_id: str, partial: Dict[str, Any]) -> bool:
    with _lock:
        jobs = load_jobs()
        if job_id not in jobs:
            return False
        jobs[job_id].update(partial)
        save_jobs(jobs)
        return True
