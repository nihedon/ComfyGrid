from pathlib import Path

from comfygrid.services import extension_service


def list_extension_resources() -> list[str]:
    resources = []
    for folder in extension_service.plugin_folders:
        js_path = Path(folder, "javascript")
        if js_path.is_dir():
            for path in js_path.glob("**/*.js"):
                resources.append(str(path).replace("\\", "/"))

        css_path = Path(folder)
        for path in css_path.glob("*.css"):
            resources.append(str(path).replace("\\", "/"))
    return resources


def list_pages() -> list[dict]:
    return []
