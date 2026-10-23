import shutil
from pathlib import Path, PureWindowsPath

from comfygrid.core.paths import resolve_within


def resolve_input_path(comfyui_path: str, filename: str, subfolder: str = "") -> Path:
    if not isinstance(filename, str) or not filename.strip() or filename.endswith(("/", "\\")):
        raise ValueError("Invalid file name")
    for value in (filename, subfolder):
        if not isinstance(value, str) or "\0" in value or ":" in value or value.startswith(("/", "\\")):
            raise ValueError("Invalid path")
        # Windows strips trailing dots/spaces and treats device names specially.
        for part in PureWindowsPath(value).parts:
            if part not in (".", "..") and (part.endswith((" ", ".")) or PureWindowsPath(part).is_reserved()):
                raise ValueError("Invalid path")

    root = resolve_within(Path(comfyui_path, "input"), "")
    directory = resolve_within(root, subfolder.replace("\\", "/"))
    target = resolve_within(root, directory / filename.replace("\\", "/"))
    if target == root or target == directory or target.is_dir():
        raise ValueError("Invalid file name")
    return target


def save_upload_to_input(comfyui_path: str, file_obj, filename: str) -> None:
    path = resolve_input_path(comfyui_path, filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file_obj, buffer)


def save_bytes_to_input(comfyui_path: str, content: bytes, filename: str) -> None:
    path = resolve_input_path(comfyui_path, filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)
