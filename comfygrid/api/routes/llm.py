from fastapi import APIRouter
from pydantic import BaseModel

from comfygrid.services import llm_service

router = APIRouter()


class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "en"
    model: str | None = None
    system: str | None = None


@router.get("/llm/status")
def get_llm_status():
    available = llm_service.is_ollama_available()
    models = llm_service.get_ollama_models() if available else []
    return {
        "available": available,
        "models": models,
    }


@router.post("/llm/translate")
def translate_text(req: TranslateRequest):
    translated = llm_service.translate_text(req.model, req.text, req.system)
    return {
        "ok": True,
        "translated_text": translated,
    }
