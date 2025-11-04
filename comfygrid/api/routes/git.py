from fastapi import APIRouter

from comfygrid.services.git import get_version_info

router = APIRouter()


@router.get("/version_info", tags=["info"])
async def _():
    return get_version_info()
