import logging
import os
import shutil
from pathlib import Path
from typing import Any

import orjson

logger = logging.getLogger(__name__)


def normalize_comfyui_dir(comfyui_path: Path | str) -> Path:
    p = Path(comfyui_path)
    if p.is_file() or p.name.endswith(".py"):
        p = p.parent
    return p


def get_workflows_dir(comfyui_path: Path | str) -> Path:
    base = normalize_comfyui_dir(comfyui_path)
    workflows_dir = base / "user" / "default" / "workflows"
    workflows_dir.mkdir(parents=True, exist_ok=True)
    return workflows_dir


def _safe_resolve(base: Path, relative_path: str) -> Path:
    target = (base / relative_path).resolve()
    if not str(target).startswith(str(base.resolve())):
        raise ValueError(f"Path traversal detected: {relative_path}")
    return target


def _get_index_file(base_dir: Path) -> Path:
    return base_dir / ".index.json"


def get_favorites(comfyui_path: Path | str) -> set[str]:
    base_dir = get_workflows_dir(comfyui_path)
    index_file = _get_index_file(base_dir)
    if not index_file.is_file():
        return set()

    try:
        data = orjson.loads(index_file.read_bytes())
        raw_favs = data.get("favorites", [])
        favs = set()
        for f in raw_favs:
            if isinstance(f, str):
                cleaned = f[10:] if f.startswith("workflows/") else f
                favs.add(cleaned.strip("/"))
        return favs
    except Exception as e:
        logger.warning("Failed to read .index.json: %s", e)
        return set()


def save_favorites(comfyui_path: Path | str, favorites: set[str]) -> None:
    base_dir = get_workflows_dir(comfyui_path)
    index_file = _get_index_file(base_dir)
    try:
        formatted = sorted([f"workflows/{f}" if not f.startswith("workflows/") else f for f in favorites])
        data = {"favorites": formatted}
        index_file.write_bytes(orjson.dumps(data, option=orjson.OPT_INDENT_2))
    except Exception as e:
        logger.error("Failed to save .index.json: %s", e)


def toggle_favorite(comfyui_path: Path | str, item_path: str, is_favorite: bool | None = None) -> bool:
    favs = get_favorites(comfyui_path)
    cleaned_path = item_path[10:] if item_path.startswith("workflows/") else item_path
    cleaned_path = cleaned_path.strip("/")

    if is_favorite is None:
        new_state = cleaned_path not in favs
    else:
        new_state = is_favorite

    if new_state:
        favs.add(cleaned_path)
    else:
        favs.discard(cleaned_path)

    save_favorites(comfyui_path, favs)
    return new_state


def list_workflows(comfyui_path: Path | str) -> dict[str, Any]:
    base_dir = get_workflows_dir(comfyui_path)
    thumbnails_dir = base_dir / ".thumbnails"
    thumbnails_dir.mkdir(exist_ok=True)
    favs = get_favorites(comfyui_path)

    items: list[dict[str, Any]] = []

    for root, dirs, files in os.walk(base_dir):
        # Skip hidden folders like .thumbnails
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        root_path = Path(root)
        rel_dir = root_path.relative_to(base_dir).as_posix()
        if rel_dir == ".":
            rel_dir = ""

        for dir_name in sorted(dirs):
            dir_rel_path = f"{rel_dir}/{dir_name}".strip("/")
            items.append({
                "type": "folder",
                "name": dir_name,
                "path": dir_rel_path,
                "parent": rel_dir,
                "modified": int(root_path.stat().st_mtime * 1000),
                "is_favorite": False,
            })

        for file_name in sorted(files):
            if not file_name.lower().endswith(".json") or file_name.startswith("."):
                continue
            file_path = root_path / file_name
            file_rel_path = f"{rel_dir}/{file_name}".strip("/")

            node_count = 0
            try:
                content = orjson.loads(file_path.read_bytes())
                if isinstance(content, dict):
                    nodes = content.get("nodes") or content.get("extra", {}).get("nodes")
                    if isinstance(nodes, list):
                        node_count = len(nodes)
            except Exception:
                pass

            thumb_rel = f"{file_rel_path}.webp"
            has_thumb = (thumbnails_dir / thumb_rel).is_file()

            items.append({
                "type": "file",
                "name": file_name,
                "path": file_rel_path,
                "parent": rel_dir,
                "size": file_path.stat().st_size,
                "modified": int(file_path.stat().st_mtime * 1000),
                "node_count": node_count,
                "has_thumbnail": has_thumb,
                "is_favorite": file_rel_path in favs,
            })

    return {
        "root": base_dir.as_posix(),
        "items": items,
    }


def create_folder(comfyui_path: Path | str, folder_path: str) -> None:
    base_dir = get_workflows_dir(comfyui_path)
    target = _safe_resolve(base_dir, folder_path)
    target.mkdir(parents=True, exist_ok=True)


def rename_item(comfyui_path: Path | str, old_path: str, new_name: str) -> str:
    base_dir = get_workflows_dir(comfyui_path)
    source = _safe_resolve(base_dir, old_path)
    if not source.exists():
        raise FileNotFoundError(f"Item not found: {old_path}")

    target = source.parent / new_name
    if target.exists():
        raise FileExistsError(f"Target already exists: {new_name}")

    source.rename(target)
    new_rel_path = target.relative_to(base_dir).as_posix()

    # Update favorites index if renamed
    favs = get_favorites(comfyui_path)
    if old_path in favs:
        favs.remove(old_path)
        favs.add(new_rel_path)
        save_favorites(comfyui_path, favs)

    return new_rel_path


def move_item(comfyui_path: Path | str, source_path: str, target_dir_path: str) -> str:
    base_dir = get_workflows_dir(comfyui_path)
    source = _safe_resolve(base_dir, source_path)
    target_dir = _safe_resolve(base_dir, target_dir_path)

    if not source.exists():
        raise FileNotFoundError(f"Source not found: {source_path}")
    if not target_dir.is_dir():
        raise NotADirectoryError(f"Target directory not found: {target_dir_path}")

    target = target_dir / source.name
    if target.exists():
        raise FileExistsError(f"Item already exists in target directory: {source.name}")

    shutil.move(str(source), str(target))
    new_rel_path = target.relative_to(base_dir).as_posix()

    # Update favorites index if moved
    favs = get_favorites(comfyui_path)
    if source_path in favs:
        favs.remove(source_path)
        favs.add(new_rel_path)
        save_favorites(comfyui_path, favs)

    return new_rel_path


def delete_item(comfyui_path: Path | str, item_path: str) -> None:
    base_dir = get_workflows_dir(comfyui_path)
    target = _safe_resolve(base_dir, item_path)
    if not target.exists():
        return

    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()

    # Remove from favorites index if deleted
    favs = get_favorites(comfyui_path)
    if item_path in favs:
        favs.remove(item_path)
        save_favorites(comfyui_path, favs)


def get_workflow_content(comfyui_path: Path | str, item_path: str) -> dict[str, Any]:
    base_dir = get_workflows_dir(comfyui_path)
    target = _safe_resolve(base_dir, item_path)
    if not target.is_file():
        raise FileNotFoundError(f"Workflow file not found: {item_path}")

    return orjson.loads(target.read_bytes())


def save_workflow_thumbnail(comfyui_path: Path | str, item_path: str, image_bytes: bytes) -> None:
    base_dir = get_workflows_dir(comfyui_path)
    thumbnails_dir = base_dir / ".thumbnails"
    thumb_path = thumbnails_dir / f"{item_path}.webp"
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    thumb_path.write_bytes(image_bytes)


def get_workflow_thumbnail_path(comfyui_path: Path | str, item_path: str) -> Path | None:
    base_dir = get_workflows_dir(comfyui_path)
    thumbnails_dir = base_dir / ".thumbnails"
    thumb_path = thumbnails_dir / f"{item_path}.webp"
    if thumb_path.is_file():
        return thumb_path
    return None
