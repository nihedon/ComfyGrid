from typing import Literal

from pydantic import BaseModel


class WorkspaceInfo(BaseModel):
    name: str
    script_path: str
    python_path: str
    comfyui_port: int | None = None


class LaunchRequest(BaseModel):
    mode: Literal["launch", "connect"]
    workspace: WorkspaceInfo | None = None
    connect_port: int | None = None
