import logging
import os
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Callable
from uuid import NAMESPACE_URL, uuid4, uuid5

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
_config_lock = threading.RLock()


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return toml.load(CONFIG_PATH)
        except Exception:
            pass
    return {}


def save_config(config: dict) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=CONFIG_PATH.parent, delete=False) as f:
            temporary = Path(f.name)
            toml.dump(config, f)
        os.replace(temporary, CONFIG_PATH)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _profiles(config: dict) -> list[dict]:
    profiles = []
    for index, value in enumerate(config.get("workspace", [])):
        profile = WorkspaceInfo(**value).model_dump(exclude_none=True)
        profile.setdefault("id", str(uuid5(NAMESPACE_URL, f"comfygrid:{index}:{profile['name']}")))
        profiles.append(profile)
    return profiles


def get_setup_config() -> dict:
    config = load_config()
    return {
        "workspaces": _profiles(config),
        "last_workspace": config.get("last_workspace", ""),
        "last_profile_id": config.get("last_profile_id"),
        "connect_host": config.get("connect_host", "127.0.0.1"),
        "connect_port": config.get("connect_port", DEFAULT_COMFYUI_PORT),
    }


def get_profile(profile_id: str) -> WorkspaceInfo:
    profile = next((p for p in _profiles(load_config()) if p["id"] == profile_id), None)
    if profile is None:
        raise KeyError("Profile not found.")
    return WorkspaceInfo(**profile)


def save_profile(workspace: WorkspaceInfo, profile_id: str | None = None) -> dict:
    with _config_lock:
        config = load_config()
        profiles = _profiles(config)
        existing = next((p for p in profiles if p["id"] == profile_id), None)
        if profile_id and existing is None:
            raise KeyError("Profile not found.")
        if any(p["id"] != profile_id and p["name"].casefold() == workspace.name.casefold() for p in profiles):
            raise ValueError("A profile with this name already exists.")
        profile = workspace.model_dump(exclude_none=True)
        profile["id"] = profile_id or str(uuid4())
        if existing is not None:
            if config.get("last_workspace") == existing["name"]:
                config["last_workspace"] = profile["name"]
            profiles[profiles.index(existing)] = profile
        else:
            profiles.append(profile)
        config["workspace"] = profiles
        save_config(config)
        return profile


def delete_profile(profile_id: str) -> None:
    with _config_lock:
        config = load_config()
        profiles = _profiles(config)
        removed = next((p for p in profiles if p["id"] == profile_id), None)
        if removed is None:
            raise KeyError("Profile not found.")
        config["workspace"] = [p for p in profiles if p["id"] != profile_id]
        if config.get("last_profile_id") == profile_id or config.get("last_workspace") == removed["name"]:
            fallback = config["workspace"][0] if config["workspace"] else {}
            config["last_profile_id"] = fallback.get("id", "")
            config["last_workspace"] = next((p["name"] for p in config["workspace"] if p["mode"] == "launch"), "")
        save_config(config)


def activate_profile(workspace: WorkspaceInfo) -> None:
    with _config_lock:
        config = load_config()
        config["last_profile_id"] = workspace.id or ""
        if workspace.mode == "connect":
            config["connect_host"] = workspace.connect_host
            config["connect_port"] = workspace.connect_port
        else:
            config["last_workspace"] = workspace.name
        save_config(config)
    port = workspace.connect_port if workspace.mode == "connect" else workspace.comfyui_port
    host = workspace.connect_host if workspace.mode == "connect" else "127.0.0.1"
    os.environ["COMFYUI_PORT"] = str(port)
    os.environ["COMFYUI_TARGET"] = f"{host}:{port}"


def active_profile_id(service) -> str | None:
    monitor = getattr(service, "_monitor_task", None)
    if not (getattr(service, "proc", None) or getattr(service, "started", False) or
            getattr(service, "setup_starting", False) or (monitor is not None and not monitor.done())):
        return None
    explicit = getattr(service, "setup_profile_id", None)
    if explicit:
        return explicit
    for profile in _profiles(load_config()):
        if profile["mode"] != getattr(service, "mode", None):
            continue
        if profile["mode"] == "connect":
            if (profile["connect_host"], profile["connect_port"]) == (service.connect_host, service.connect_port):
                return profile["id"]
        elif (os.path.dirname(profile["script_path"]), profile["comfyui_port"], profile["comfyui_args"]) == (
                service.comfyui_path, service.comfyui_port, service.comfyui_args):
            return profile["id"]
    return None


def save_launch_workspace(workspace: WorkspaceInfo) -> None:
    existing = next((p for p in _profiles(load_config()) if p["name"] == workspace.name), None)
    profile = save_profile(workspace, existing["id"] if existing else None)
    activate_profile(WorkspaceInfo(**profile))


def save_connect_port(connect_port: int, connect_host: str = "127.0.0.1") -> None:
    with _config_lock:
        config = load_config()
        config["connect_host"] = connect_host or "127.0.0.1"
        config["connect_port"] = connect_port
        save_config(config)
    host = connect_host or "127.0.0.1"
    os.environ["COMFYUI_PORT"] = str(connect_port)
    os.environ["COMFYUI_TARGET"] = f"{host}:{connect_port}"


def prepare_launch_dependencies(comfy_service) -> None:
    install_recommended_extensions()
    comfy_service.install_grid_extension()
    load_extensions()
    from comfygrid.services.tag_service import ensure_tag_models_generated

    ensure_tag_models_generated()


def install_ffmpeg(progress_callback: Callable[[int, int], None] | None = None) -> None:
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


def install_caddy(progress_callback: Callable[[int, int], None] | None = None) -> None:
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
