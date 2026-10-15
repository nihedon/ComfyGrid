from pathlib import Path


def resolve_within(base: Path, path: str | Path) -> Path:
    try:
        root = base.resolve()
        target = (root / path).resolve()
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"Invalid path: {path}") from exc
    if not target.is_relative_to(root):
        raise ValueError(f"Path traversal detected: {path}")
    return target
