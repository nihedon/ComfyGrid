from typing import Literal

from pydantic import BaseModel, Field, field_validator


class WorkspaceInfo(BaseModel):
    id: str | None = None
    name: str
    mode: Literal["launch", "connect"] = "launch"
    script_path: str = ""
    python_path: str = ""
    comfyui_port: int = Field(default=8188, ge=1, le=65535)
    comfyui_args: str = ""
    connect_host: str = "127.0.0.1"
    connect_port: int = Field(default=8188, ge=1, le=65535)

    @field_validator("name", "connect_host")
    @classmethod
    def nonempty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A name and connection host are required.")
        return value


class LaunchRequest(BaseModel):
    mode: Literal["launch", "connect"]
    workspace: WorkspaceInfo | None = None
    connect_host: str | None = "127.0.0.1"
    connect_port: int | None = None
    profile_id: str | None = None
