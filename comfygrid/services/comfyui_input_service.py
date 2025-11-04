import shutil
from pathlib import Path


def save_upload_to_input(comfyui_path: str, file_obj, filename: str) -> None:
    save_dir = Path(comfyui_path, "input")
    save_dir.mkdir(exist_ok=True)
    with open(save_dir / filename, "wb") as buffer:
        shutil.copyfileobj(file_obj, buffer)


def save_bytes_to_input(comfyui_path: str, content: bytes, filename: str) -> None:
    save_dir = Path(comfyui_path, "input")
    save_dir.mkdir(exist_ok=True)
    with open(save_dir / filename, "wb") as f:
        f.write(content)
