import asyncio
import json
import logging
import urllib.request
from urllib.error import URLError
from typing import TypedDict

import httpx

from comfygrid.domain import state

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://127.0.0.1:11434"


class TranslationError(RuntimeError):
    def __init__(self, code: str, message: str, details: str = "", status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code
        self.detail = {"code": code, "message": message, "details": details}


class OllamaModelFetchError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def is_ollama_available() -> bool:
    """Check if ollama service is available and responding with models."""
    try:
        models = get_ollama_models()
        return len(models) > 0
    except Exception:
        return False


class OllamaModel(TypedDict):
    name: str
    size: int | None


def get_ollama_model_details(*, raise_on_error: bool = False) -> list[OllamaModel]:
    """Get available Ollama models, deduplicated by name, with sizes in bytes."""
    try:
        ollama_base_url = state.opts.data.get("ComfyGrid.ollama.url", OLLAMA_BASE_URL)
        req = urllib.request.Request(f"{ollama_base_url}/api/tags", headers={"User-Agent": "ComfyGrid"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            if resp.status != 200:
                raise RuntimeError(f"Ollama model list returned HTTP {resp.status}.")
            data = json.loads(resp.read().decode("utf-8"))
            if not isinstance(data, dict) or not isinstance(data.get("models"), list):
                raise ValueError("Ollama returned an invalid model list.")
            models: dict[str, OllamaModel] = {}
            for item in data["models"]:
                if not isinstance(item, dict):
                    raise ValueError("Ollama returned an invalid model entry.")
                name = item.get("name")
                if not isinstance(name, str) or not name.strip():
                    raise ValueError("Ollama returned a model without a valid name.")
                size = item.get("size")
                if not isinstance(size, int) or isinstance(size, bool) or size < 0:
                    size = None
                if name not in models or models[name]["size"] is None:
                    models[name] = {"name": name, "size": size}
            return list(models.values())
    except Exception as e:
        logger.warning("Failed to fetch Ollama models: %s", e)
        if raise_on_error:
            if isinstance(e, TimeoutError) or (isinstance(e, URLError) and isinstance(e.reason, TimeoutError)):
                raise OllamaModelFetchError("Ollama model list request timed out.", status_code=504) from e
            raise OllamaModelFetchError(f"Failed to fetch Ollama models: {e}") from e
        return []


def get_ollama_models() -> list[str]:
    """Get names of available Ollama models."""
    return [model["name"] for model in get_ollama_model_details()]


async def translate_text(model: str | None, prompt: str, system: str | None = None, seed_mode: str | None = None) -> str:
    """Translate text using local Ollama LLM."""
    if not prompt.strip():
        return prompt

    models = await asyncio.to_thread(get_ollama_models)
    if not models:
        logger.warning("Ollama is not available for translation.")
        raise TranslationError("unavailable", "Ollama is not available.")

    if model is None:
        raise ValueError("Ollama model is not specified.")

    if model not in models:
        logger.warning("Ollama model not found: %s", model)
        raise ValueError(f"Ollama model {model} not found.")

    system_prompt = system if system is not None else state.opts.data.get("ComfyGrid.ollama.system")

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": True,
        "options": {
            "temperature": 0.3,
            "seed": -1 if (seed_mode or state.opts.data.get("ComfyGrid.ollama.seed_mode", "fixed")) == "random" else 0,
        }
    }

    if system_prompt:
        payload["system"] = system_prompt

    try:
        ollama_base_url = state.opts.data.get("ComfyGrid.ollama.url", OLLAMA_BASE_URL)
        parts: list[str] = []
        completed = False
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=3.0)) as client:
            async with client.stream(
                "POST",
                f"{ollama_base_url}/api/generate",
                json=payload,
                headers={"User-Agent": "ComfyGrid"},
            ) as response:
                if not response.is_success:
                    await response.aread()
                    try:
                        body = response.json()
                        details = str(body.get("error", "")) if isinstance(body, dict) else ""
                    except ValueError:
                        details = response.text if "html" not in response.headers.get("content-type", "").lower() else ""
                    raise TranslationError(
                        "ollama_error", f"Ollama returned HTTP {response.status_code}.",
                        f"HTTP {response.status_code}\n{details[:8192]}" if details else "",
                        504 if response.status_code == 504 else 502,
                    )
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    if data.get("error"):
                        raise TranslationError("ollama_error", "Ollama translation failed.", str(data["error"])[:8192])
                    parts.append(data.get("response", ""))
                    if data.get("done"):
                        completed = True
                        break
        if not completed:
            raise TranslationError("incomplete", "Ollama translation stream ended before completion.")
        translated = "".join(parts).strip()
        if not translated:
            raise TranslationError("empty", "Ollama returned empty translation response.")
        return translated
    except TranslationError:
        raise
    except httpx.TimeoutException as e:
        raise TranslationError("timeout", "Ollama translation timed out.", status_code=504) from e
    except httpx.ConnectError as e:
        raise TranslationError("unavailable", "Could not connect to Ollama.") from e
    except Exception as e:
        logger.error("Ollama translation failed: %s", e)
        raise TranslationError("failed", "Ollama translation failed.", str(e) or type(e).__name__) from e
