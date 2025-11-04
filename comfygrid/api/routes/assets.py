from fastapi import APIRouter
from fastapi.responses import JSONResponse

from comfygrid.services import asset_service

router = APIRouter()


@router.get("/extension/resources")
async def extension_resources():
    return JSONResponse(asset_service.list_extension_resources())


@router.get("/pages")
async def pages():
    return JSONResponse(asset_service.list_pages())
