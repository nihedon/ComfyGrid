import logging
import os
import subprocess
from pathlib import Path
from typing import Callable

import toml

from comfygrid.core.config import load_install_config
from comfygrid.infrastructure.caddy import ensure_caddy
from comfygrid.infrastructure.caddy import start_caddy as _start_caddy
from comfygrid.infrastructure.ffmpeg import ensure_ffmpeg
from comfygrid.schemas.setup import WorkspaceInfo
from comfygrid.services.comfyui import DEFAULT_COMFYUI_PORT
from comfygrid.services.extension_service import load_extensions
from comfygrid.services.git import install_from_git, update_git_repository

CONFIG_PATH = Path("config", "comfyui.toml")


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return toml.load(CONFIG_PATH)
        except Exception:
            pass
    return {}


def save_config(config: dict) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        toml.dump(config, f)


def get_setup_config() -> dict:
    config = load_config()
    return {
        "workspaces": config.get("workspace", []),
        "last_workspace": config.get("last_workspace", ""),
        "connect_port": config.get("connect_port", DEFAULT_COMFYUI_PORT),
    }


def save_launch_workspace(workspace: WorkspaceInfo) -> None:
    config = load_config()
    workspaces: list[dict] = config.get("workspace", [])
    existing = next((w for w in workspaces if w["name"] == workspace.name), None)
    if existing:
        existing["script_path"] = workspace.script_path
        existing["python_path"] = workspace.python_path
        existing["comfyui_port"] = workspace.comfyui_port
    else:
        workspaces.append(
            {
                "name": workspace.name,
                "script_path": workspace.script_path,
                "python_path": workspace.python_path,
                "comfyui_port": workspace.comfyui_port,
            }
        )

    config["workspace"] = workspaces
    config["last_workspace"] = workspace.name
    save_config(config)
    os.environ["COMFYUI_PORT"] = str(workspace.comfyui_port)


def save_connect_port(connect_port: int) -> None:
    config = load_config()
    config["connect_port"] = connect_port
    save_config(config)
    os.environ["COMFYUI_PORT"] = str(connect_port)


def prepare_launch_dependencies(comfy_service) -> None:
    install_recommended_extensions()
    comfy_service.install_grid_extension()
    load_extensions()


def install_ffmpeg(progress_callback: Callable[[int, int], None] = None) -> None:
    ffmpeg_config = load_install_config().get("ffmpeg")
    if not ffmpeg_config:
        return

    url = ffmpeg_config.get("url", "")
    bin_dir = Path(ffmpeg_config.get("bin_dir", "bin"))
    if not url:
        return

    try:
        ensure_ffmpeg(url, bin_dir, progress_callback)
    except Exception as e:
        logging.error("Failed to install ffmpeg: %s", e)


def install_caddy(progress_callback: Callable[[int, int], None] = None) -> None:
    caddy_config = load_install_config().get("caddy")
    if not caddy_config:
        return

    try:
        ensure_caddy(caddy_config, progress_callback)
    except Exception as e:
        logging.error("Failed to install Caddy: %s", e)


def start_caddy_proxy() -> None:
    caddy_config = load_install_config().get("caddy")
    if not caddy_config:
        return

    from pathlib import Path as _Path
    bin_dir = _Path(caddy_config.get("bin_dir", "bin/caddy"))
    caddyfile = _Path(caddy_config.get("caddyfile", "Caddyfile"))

    from comfygrid.infrastructure.caddy import get_caddy_path
    caddy_path = get_caddy_path(bin_dir)
    if not caddy_path:
        logging.warning("Caddy binary not found; skipping proxy startup")
        return

    if not caddyfile.is_file():
        logging.warning("Caddyfile not found at %s; skipping proxy startup", caddyfile)
        return

    try:
        _start_caddy(caddy_path, caddyfile)
    except Exception as e:
        logging.error("Failed to start Caddy: %s", e)


def install_recommended_extensions() -> None:
    recommend_file = Path("config", "recommend.toml")
    if not recommend_file.is_file():
        return

    extensions = toml.load(recommend_file)
    ext_base = Path("extensions")
    ext_base.mkdir(exist_ok=True)

    for name, ext in extensions.items():
        try:
            repo = ext.get("repo", "")
            branch = ext.get("branch")
            version = ext.get("version")
            if not repo:
                continue

            ext_dir = ext_base / name
            if ext_dir.is_dir():
                if version and version.upper() != "HEAD":
                    subprocess.run(["git", "-C", str(ext_dir), "checkout", version], check=True)
                elif os.getenv("COMFYGRID_EXTENSION_UPDATE", "True").lower() == "true":
                    update_git_repository(str(ext_dir))
            else:
                install_from_git(repo, str(ext_dir), branch, version)
        except Exception as e:
            logging.error("Failed to install extension: %s, error: %s", ext, e)
