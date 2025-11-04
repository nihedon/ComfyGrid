from pathlib import Path

from fastapi import (APIRouter, File, Form, HTTPException, Request, Response,
                     UploadFile)
from fastapi.responses import JSONResponse, StreamingResponse

from comfygrid.services import image_service

router = APIRouter()


@router.post("/download_image")
def download_image(request: Request, form: str | None = Form(None)):
    data = image_service.parse_form_json(form)
    bin_data, out_filename = image_service.build_download_media(data["url"], data.get("image_info", {}))

    if bin_data is None or out_filename is None:
        return JSONResponse({"error": "Failed to read media"}, status_code=500)

    return StreamingResponse(
        iter([bin_data]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{out_filename}"'},
    )


@router.post("/save_image")
def save_image(request: Request, data: dict):
    if not image_service.save_media(data["url"], data.get("image_info", {}), Path.cwd()):
        return JSONResponse({"error": "Failed to read media"}, status_code=500)
    return {"success": True}


@router.post("/image_info")
def image_info(file: UploadFile = File(...)):
    if file.filename is None or file.filename == "":
        return JSONResponse({"error": "Invalid file name"}, status_code=400)
    return image_service.read_uploaded_media_metadata(file.filename, file)


@router.get("/resize")
def resize(request: Request, url: str, size: int):
    result_bytes = image_service.resize_image_from_url(url, size)
    if result_bytes is None:
        raise HTTPException(status_code=500, detail="Failed to resize image")
    return Response(content=result_bytes, media_type="image/jpeg")


@router.get("/video_thumbnail")
def video_thumbnail(request: Request, url: str, size: int = 120):
    result_bytes = image_service.video_thumbnail_from_url(url, size)
    if result_bytes is None:
        raise HTTPException(status_code=500, detail="Failed to generate video thumbnail")
    return Response(content=result_bytes, media_type="image/jpeg")
