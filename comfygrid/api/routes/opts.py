from fastapi import APIRouter
from fastapi.responses import JSONResponse

from comfygrid.services import settings_service

router = APIRouter()


@router.get("/opts")
async def get_options():
    return JSONResponse(settings_service.get_options_payload())


@router.post("/opts")
async def save_options(settings: dict):
    settings_service.save_options(settings)
