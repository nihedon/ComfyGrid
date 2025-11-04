import importlib
import logging
import os
import subprocess
import sys
from pathlib import Path

import orjson

from comfygrid.services.git import update_git_repository

plugin_folders = []
PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXTENSIONS_DIR = PROJECT_ROOT / "extensions"
CUSTOM_EXTENSIONS_DIR = PROJECT_ROOT / "custom_nodes"


def load_extensions():
    base = EXTENSIONS_DIR
    if not base.is_dir():
        logging.warning("Extensions directory not found: %s", base)
        return

    project_root = str(PROJECT_ROOT)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    for ext_dir in sorted([p for p in base.iterdir() if p.is_dir()]):
        if (ext_dir / ".git").exists() and os.getenv("COMFYGRID_EXTENSION_UPDATE", "True").lower() == "true":
            update_git_repository(str(ext_dir))

        install_py = ext_dir / "install.py"
        scripts_init = ext_dir / "scripts" / "__init__.py"

        if scripts_init.is_file():
            if install_py.is_file():
                try:
                    logging.info("Running installer: %s", install_py)
                    env = os.environ.copy()
                    env["PYTHONPATH"] = project_root + os.pathsep + env.get("PYTHONPATH", "")
                    subprocess.run([sys.executable, str(install_py)], env=env, check=True)
                except Exception as e:
                    logging.error("Failed to run installer %s: %s", install_py, e)
                    continue

            rel_pkg = scripts_init.parent.relative_to(PROJECT_ROOT)
            mod_name = ".".join(rel_pkg.parts)
            try:
                importlib.import_module(mod_name)
                folder = "/".join(rel_pkg.parts[:-1])
                if folder not in plugin_folders:
                    plugin_folders.append(folder)
                logging.info("Loaded plugin module: %s", mod_name)
            except Exception as e:
                logging.error("Failed to load plugin module %s: %s", mod_name, e)
                continue


def list_custom_nodes() -> list[dict]:
    if not CUSTOM_EXTENSIONS_DIR.exists():
        return []

    result = []
    for ext_dir in sorted(CUSTOM_EXTENSIONS_DIR.iterdir()):
        manifest_path = ext_dir / "manifest.json"
        if ext_dir.is_dir() and manifest_path.exists():
            try:
                manifest = orjson.loads(manifest_path.read_text(encoding="utf-8"))
                result.append({ext_dir.name: manifest})
            except Exception:
                logging.exception("Failed to read extension manifest: %s", manifest_path)
    return result


def get_custom_widget_path(name: str) -> Path | None:
    return get_custom_asset_path(name, "widget.js")


def get_custom_asset_path(name: str, asset_path: str) -> Path | None:
    if ".." in Path(asset_path).parts:
        return None

    extension_dir = (CUSTOM_EXTENSIONS_DIR / name).resolve()
    path = (extension_dir / asset_path).resolve()

    try:
        path.relative_to(extension_dir)
    except ValueError:
        return None

    return path if path.is_file() else None
