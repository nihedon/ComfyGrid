import subprocess
import sys
from importlib.metadata import PackageNotFoundError, version
from importlib.util import find_spec


def is_importable(import_name: str) -> bool:
    return find_spec(import_name) is not None


def is_installed(dist_name: str) -> bool:
    try:
        version(dist_name)
        return True
    except PackageNotFoundError:
        return False


def run_pip(command: str, package_name: str, *comfyui_args: str) -> None:
    if getattr(sys, "frozen", False):
        try:
            from pip._internal.cli.main import main as pip_main
            pip_main([command, package_name, *comfyui_args])
        except Exception as e:
            raise RuntimeError(f"Failed to run pip in frozen mode: {e}")
    else:
        subprocess.check_call([sys.executable, "-m", "pip", command, package_name, *comfyui_args])


def ensure_installed(import_name: str, dist_name: str | None = None) -> None:
    dist = dist_name or import_name
    if is_importable(import_name):
        return
    if not is_installed(dist):
        print(f"Installing {dist} ...")
        run_pip("install", dist)
    if not is_importable(import_name):
        raise RuntimeError(f"Package '{dist}' installed, but module '{import_name}' not importable.")
