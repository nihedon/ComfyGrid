import os
import sys
from dataclasses import dataclass
from pathlib import Path

import toml

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PROXY_PORT = 6210
DEFAULT_SERVER_PORT = 8000
PROJECT_ROOT = Path.cwd()
CONFIG_DIR = Path("config")
FRONTEND_SRC_DIR = Path("frontend")
FRONTEND_DIST_DIR = FRONTEND_SRC_DIR / "dist"


@dataclass(frozen=True)
class AppSettings:
    env: str
    host: str
    proxy_port: int
    server_port: int
    log_level: str
    frontend_src_dir: Path
    frontend_dist_dir: Path
    install_config: dict


def load_install_config() -> dict:
    return toml.load(CONFIG_DIR / "install.toml")


def load_settings(env: str = "dev") -> AppSettings:
    frontend_dir = os.getenv("COMFYGRID_FRONTEND_DIR")
    is_frozen = getattr(sys, "frozen", False)
    default_dist_dir = Path("frontend") if is_frozen else FRONTEND_DIST_DIR
    return AppSettings(
        env=env,
        host=os.getenv("COMFYGRID_HOST", DEFAULT_HOST),
        proxy_port=int(os.getenv("COMFYGRID_PROXY_PORT", DEFAULT_PROXY_PORT)),
        server_port=int(os.getenv("COMFYGRID_SERVER_PORT", DEFAULT_SERVER_PORT)),
        log_level=os.getenv("COMFYGRID_LOG_LEVEL", "INFO"),
        frontend_src_dir=FRONTEND_SRC_DIR,
        frontend_dist_dir=Path(frontend_dir) if frontend_dir else default_dist_dir,
        install_config=load_install_config(),
    )
