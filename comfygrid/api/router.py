from fastapi import APIRouter

from comfygrid.api.routes.assets import router as assets_router
from comfygrid.api.routes.comfyui import router as comfy_router
from comfygrid.api.routes.extensions import router as extensions_router
from comfygrid.api.routes.files import router as files_router
from comfygrid.api.routes.git import router as git_router
from comfygrid.api.routes.images import router as images_router
from comfygrid.api.routes.opts import router as opts_router
from comfygrid.api.routes.setup import router as setup_router
from comfygrid.api.routes.system import router as system_router
from comfygrid.api.routes.websocket import router as ws_router


def create_api_router() -> APIRouter:
    router = APIRouter(prefix="/comfygrid")
    router.include_router(comfy_router, prefix="/api", tags=["comfy"])
    router.include_router(opts_router, prefix="/api", tags=["opts"])
    router.include_router(images_router, prefix="/api", tags=["images"])
    router.include_router(assets_router, prefix="/api", tags=["assets"])
    router.include_router(git_router, prefix="/api", tags=["git"])
    router.include_router(files_router, prefix="/api", tags=["files"])
    router.include_router(system_router, prefix="/api", tags=["system"])
    router.include_router(extensions_router, prefix="/api", tags=["extensions"])
    router.include_router(setup_router, prefix="/api/setup", tags=["setup"])
    router.include_router(ws_router, prefix="/ws", tags=["ws"])
    return router
