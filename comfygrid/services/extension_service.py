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


def load_extensions(app=None):
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

        manifest_path = ext_dir / "manifest.json"
        manifest = {}
        if manifest_path.is_file():
            try:
                manifest = orjson.loads(manifest_path.read_text(encoding="utf-8"))
            except Exception as e:
                logging.error("Failed to parse manifest %s: %s", manifest_path, e)

        # 1. Execute python install script if defined in manifest or exists as install.py
        py_config = manifest.get("python", {})
        install_script = py_config.get("install") or ("install.py" if (ext_dir / "install.py").is_file() else None)

        if install_script and (ext_dir / install_script).is_file():
            install_path = ext_dir / install_script
            try:
                logging.info("Running installer: %s", install_path)
                env = os.environ.copy()
                env["PYTHONPATH"] = project_root + os.pathsep + env.get("PYTHONPATH", "")
                subprocess.run([sys.executable, str(install_path)], env=env, check=True)
            except Exception as e:
                logging.error("Failed to run installer %s: %s", install_path, e)
                continue

        # 2. Load python entry module if defined in manifest or fallback to __init__.py
        entry_script = py_config.get("entry")
        py_init = None
        if entry_script and (ext_dir / entry_script).is_file():
            py_init = ext_dir / entry_script
        elif (ext_dir / "__init__.py").is_file():
            py_init = ext_dir / "__init__.py"
        elif (ext_dir / "scripts" / "__init__.py").is_file():
            py_init = ext_dir / "scripts" / "__init__.py"

        if py_init:
            rel_pkg = py_init.parent.relative_to(PROJECT_ROOT)
            mod_name = ".".join(rel_pkg.parts)
            try:
                mod = importlib.import_module(mod_name)
                if app and hasattr(mod, "setup"):
                    mod.setup(app)
                logging.info("Loaded extension module: %s", mod_name)
            except Exception as e:
                logging.error("Failed to load extension module %s: %s", mod_name, e)
                continue

        folder = str(ext_dir)
        if folder not in plugin_folders:
            plugin_folders.append(folder)


def list_extensions() -> list[dict]:
    result = []
    dirs_to_scan = [EXTENSIONS_DIR]

    for base_dir in dirs_to_scan:
        if not base_dir.exists():
            continue
        for ext_dir in sorted([p for p in base_dir.iterdir() if p.is_dir()]):
            try:
                manifest_path = ext_dir / "manifest.json"
                if manifest_path.exists():
                    manifest = orjson.loads(manifest_path.read_text(encoding="utf-8"))
                    manifest.setdefault("id", ext_dir.name)
                    manifest.setdefault("name", ext_dir.name)
                    result.append(manifest)
            except Exception as e:
                logging.error("Failed to process extension directory %s: %s", ext_dir, e)
    return result


def get_custom_asset_path(name: str, asset_path: str) -> Path | None:
    if ".." in Path(asset_path).parts:
        return None

    for base_dir in [EXTENSIONS_DIR]:
        extension_dir = (base_dir / name).resolve()
        path = (extension_dir / asset_path).resolve()
        try:
            path.relative_to(extension_dir)
            if path.is_file():
                return path
        except ValueError:
            continue

    return None
