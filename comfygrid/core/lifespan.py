import asyncio
import logging
import webbrowser
from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
from fastapi import FastAPI

from comfygrid.core.config import AppSettings
from comfygrid.infrastructure.caddy import stop_caddy
from comfygrid.infrastructure.database import initialize_db
from comfygrid.services import job_service
from comfygrid.services.comfyui import ComfyUIService
from comfygrid.services.setup_service import install_caddy, start_caddy_proxy


def create_lifespan(settings: AppSettings):
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            initialize_db()
        except Exception as e:
            logging.warning("Failed to initialize database: %s", e)
        try:
            job_service.initialize()
        except Exception as e:
            logging.warning("Failed to initialize job service: %s", e)
        comfy_service = ComfyUIService(app)
        log_processor_task = asyncio.create_task(comfy_service.process_startup_logs())

        client = httpx.AsyncClient(timeout=30.0)
        app.state.client = client

        try:
            if settings.env == "prod":
                install_caddy()
                start_caddy_proxy()
                webbrowser.open(f"http://{settings.host}:{settings.proxy_port}/comfygrid/")
            yield
        except Exception as e:
            logging.error("Error occurred: %s", e)
        finally:
            await client.aclose()
            log_processor_task.cancel()
            try:
                await log_processor_task
            except asyncio.CancelledError:
                pass
            comfy_service.exit()
            if settings.env == "prod":
                stop_caddy()

    return lifespan
