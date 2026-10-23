from urllib.parse import quote

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from comfygrid.services.workflow_import_service import WorkflowImportError, download_workflow

router = APIRouter()


class WorkflowUrlRequest(BaseModel):
    url: str = Field(min_length=1, max_length=8192)


@router.post("/workflow/import-url")
async def import_url(body: WorkflowUrlRequest):
    try:
        result = await download_workflow(body.url)
    except WorkflowImportError as error:
        return JSONResponse({"error": str(error)}, status_code=error.status)
    return Response(
        result.content,
        media_type=result.media_type,
        headers={"X-ComfyGrid-Filename": quote(result.filename, safe=""), "Cache-Control": "no-store"},
    )
