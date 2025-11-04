import logging
import shutil
import subprocess
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from comfygrid.core.config import AppSettings


def mount_frontend(app: FastAPI, settings: AppSettings) -> None:
    frontend_dir = settings.frontend_dist_dir

    if not frontend_dir.is_dir() or not (frontend_dir / "index.html").is_file():
        logging.info("Frontend dist not found, building from source...")
        build_frontend(
            settings.frontend_src_dir,
            frontend_dir,
        )

    app.mount("/comfygrid/assets", StaticFiles(directory=str(frontend_dir / "assets")), name="assets")
    app.mount("/comfygrid", StaticFiles(directory=str(frontend_dir), html=True), name="static")

    @app.get("/comfygrid")
    @app.get("/comfygrid/")
    async def root():
        return FileResponse(frontend_dir / "index.html")


def build_frontend(src_dir: Path, dist_dir: Path) -> None:
    """Build the frontend from the local source directory."""
    if not src_dir.is_dir():
        logging.error("Frontend source directory not found at %s", src_dir)
        return

    logging.info("Installing frontend dependencies in %s...", src_dir)
    try:
        subprocess.run(["pnpm", "install"], cwd=str(src_dir), check=True, shell=True)
    except subprocess.CalledProcessError as e:
        logging.error("Failed to install frontend dependencies: %s", e)
        return

    logging.info("Building frontend in %s...", src_dir)
    try:
        subprocess.run(["pnpm", "run", "build"], cwd=str(src_dir), check=True, shell=True)
    except subprocess.CalledProcessError as e:
        logging.error("Failed to build frontend: %s", e)
        return

    built_dist = src_dir / "dist"
    if not built_dist.is_dir():
        logging.error("Frontend build failed: dist directory not found at %s", built_dist)
        return

    if dist_dir.resolve() != built_dist.resolve():
        logging.info("Copying frontend build from %s to %s...", built_dist, dist_dir)
        if dist_dir.exists():
            shutil.rmtree(dist_dir)
        shutil.copytree(str(built_dist), str(dist_dir))

    logging.info("Frontend build completed successfully.")
