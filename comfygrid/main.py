import argparse
import logging
import os

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware

from comfygrid.api.router import create_api_router
from comfygrid.core.config import (DEFAULT_HOST, DEFAULT_PROXY_PORT,
                                   DEFAULT_SERVER_PORT, load_settings)
from comfygrid.core.frontend import mount_frontend
from comfygrid.core.lifespan import create_lifespan
from comfygrid.core.logging import configure_logging


def create_app(*_comfy_args: str, env: str | None = None) -> FastAPI:
    settings = load_settings(env or os.getenv("ENV", "dev"))
    configure_logging(settings)

    logging.info("Running in %s mode", settings.env)

    os.environ["COMFYGRID_FRONTEND_DIR"] = str(settings.frontend_dist_dir)
    app = FastAPI(lifespan=create_lifespan(settings))
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    app.include_router(create_api_router())

    if settings.env == "prod":
        mount_frontend(app, settings)
    else:
        logging.info("Dev mode: frontend is not served. Use the Vite dev server.")

    return app


def run() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.getenv("COMFYGRID_HOST", DEFAULT_HOST))
    parser.add_argument("--port", type=int, default=int(os.getenv("COMFYGRID_PROXY_PORT", DEFAULT_PROXY_PORT)))
    parser.add_argument("--server-port", type=int, default=int(os.getenv("COMFYGRID_SERVER_PORT", DEFAULT_SERVER_PORT)))
    parser.add_argument("--log-level", default=os.getenv("COMFYGRID_LOG_LEVEL", "INFO"))
    parser.add_argument("--extension-update", action="store_true")
    parser.add_argument("--comfyui-args", default=os.getenv("COMFYUI_ARGS", ""))

    args, comfy_args = parser.parse_known_args()

    os.environ["COMFYGRID_HOST"] = args.host
    os.environ["COMFYGRID_PROXY_PORT"] = str(args.port)
    os.environ["COMFYGRID_SERVER_PORT"] = str(args.server_port)
    os.environ["COMFYGRID_LOG_LEVEL"] = args.log_level
    os.environ["COMFYGRID_EXTENSION_UPDATE"] = str(args.extension_update)
    os.environ["COMFYUI_ARGS"] = args.comfyui_args

    app = create_app(*comfy_args, env="prod")

    uvicorn.run(
        app,
        host=args.host,
        port=args.server_port,
        reload=False,
    )


if __name__ == "__main__":
    run()
