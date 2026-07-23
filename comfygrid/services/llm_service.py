import json
import logging
import shutil
import urllib.request

from comfygrid.domain import state

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://127.0.0.1:11434"


def is_ollama_available() -> bool:
    """Check if ollama service is available and responding."""
    try:
        ollama_base_url = state.opts.data.get("ComfyGrid.ollama.url", OLLAMA_BASE_URL)
        req = urllib.request.Request(f"{ollama_base_url}/api/tags", headers={"User-Agent": "ComfyGrid"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def get_ollama_models() -> list[str]:
    """Get list of available Ollama models."""
    try:
        ollama_base_url = state.opts.data.get("ComfyGrid.ollama.url", OLLAMA_BASE_URL)
        req = urllib.request.Request(f"{ollama_base_url}/api/tags", headers={"User-Agent": "ComfyGrid"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
            return models
    except Exception as e:
        logger.warning("Failed to fetch Ollama models: %s", e)
        return []


def translate_text(model: str | None, prompt: str, system: str | None = None) -> str:
    """Translate text using local Ollama LLM."""
    if not prompt.strip():
        return prompt

    if not is_ollama_available():
        logger.warning("Ollama is not available for translation.")
        return prompt

    if model is None:
        raise ValueError("Ollama model is not specified.")

    models = get_ollama_models()
    if model not in models:
        logger.warning("Ollama model not found: %s", model)
        raise ValueError(f"Ollama model {model} not found.")

    system_prompt = system if system is not None else state.opts.data.get("ComfyGrid.ollama.system")

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.3,
        }
    }

    if system_prompt:
        payload["system"] = system_prompt

    try:
        ollama_base_url = state.opts.data.get("ComfyGrid.ollama.url", OLLAMA_BASE_URL)
        req = urllib.request.Request(
            f"{ollama_base_url}/api/generate",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "ComfyGrid"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30.0) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            translated = res_data.get("response", "").strip()
            return translated if translated else prompt
    except Exception as e:
        logger.error("Ollama translation failed: %s", e)
        return prompt
