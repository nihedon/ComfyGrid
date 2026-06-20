from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from comfygrid.services import job_service

router = APIRouter()


@router.post("/jobs/{job_id}")
def save_job(job_id: str, data: Dict[str, Any]):
    job_service.set_job(job_id, data)
    return {"status": "ok"}


@router.get("/jobs")
def get_all_jobs():
    return job_service.get_all_jobs()


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = job_service.get_job(job_id)
    if job:
        return job
    return {}


@router.patch("/jobs/{job_id}")
def patch_job(job_id: str, data: Dict[str, Any]):
    updated = job_service.patch_job(job_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": "ok"}
