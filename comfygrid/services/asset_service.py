from pathlib import Path
import orjson

from comfygrid.services import extension_service


def list_extension_resources() -> list[str]:
    resources = []
    for folder in extension_service.plugin_folders:
        folder_path = Path(folder)
        manifest_path = folder_path / "manifest.json"

        if manifest_path.is_file():
            try:
                manifest = orjson.loads(manifest_path.read_text(encoding="utf-8"))
                frontend_config = manifest.get("frontend") or manifest.get("assets", {})

                scripts = frontend_config.get("scripts", [])
                for script in scripts:
                    sp = folder_path / script
                    if sp.is_file():
                        resources.append(sp.as_posix())

                styles = frontend_config.get("styles", [])
                for style in styles:
                    stp = folder_path / style
                    if stp.is_file():
                        resources.append(stp.as_posix())
                continue
            except Exception:
                pass

        # Fallback for un-manifested legacy folders
        js_path = folder_path / "javascript"
        if js_path.is_dir():
            for path in js_path.glob("**/*.js"):
                resources.append(path.as_posix())

        for path in folder_path.glob("*.css"):
            resources.append(path.as_posix())

    return resources


def list_pages() -> list[dict]:
    return []
