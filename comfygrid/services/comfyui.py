import asyncio
import json
import logging
import os
import re
import shlex
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from queue import Queue
from typing import Literal
from urllib.parse import urlparse, urlunparse

import toml
import websockets
from fastapi import FastAPI

from comfygrid.core.args import parse_python_args
from comfygrid.schemas.setup import WorkspaceInfo

INSTALL_CONFIG = toml.load(Path("config", "install.toml"))

logger = logging.getLogger(__name__)

ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

DEFAULT_COMFYUI_PORT = 8188


def strip_ansi(text: str) -> str:
    """Remove ANSI escape codes from text"""
    return ANSI_ESCAPE.sub('', text)


def rel_to_abs(base_path: str, path: str) -> str:
    if path is None:
        return None
    if os.path.isabs(path):
        return path
    return os.path.abspath(Path(base_path, path))


class ComfyUIService:
    _instance = None

    proc = None
    url = None
    started: bool = False
    mode: Literal["launch", "connect"] = None
    comfyui_path: str = ""
    python_path: str = ""
    comfyui_port: int = DEFAULT_COMFYUI_PORT
    connect_port: int = DEFAULT_COMFYUI_PORT
    output_directory: str = ""
    startup_log_clients: list = []
    startup_log_queue: Queue = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(ComfyUIService, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    last_args = []

    def __init__(self, app: FastAPI):
        if self._initialized:
            return
        self._initialized = True

        app.state.comfy_service = self

        self.startup_log_queue = Queue()
        self.log_history = []
        self.startup_log_clients = []

        self._load_config_if_ready()

    def _load_config_if_ready(self):
        config_path = Path("config", "comfyui.toml")
        if not config_path.exists():
            return

        try:
            config = toml.load(config_path)
        except Exception:
            return

        workspaces: list[dict] = config.get("workspace", [])
        last_workspace_name: str = config.get("last_workspace", "")
        saved_connect_port: int = config.get("connect_port", DEFAULT_COMFYUI_PORT)

        active_workspace = next(
            (w for w in workspaces if w.get("name") == last_workspace_name),
            workspaces[0] if workspaces else None,
        )

        if active_workspace:
            self.comfyui_path = active_workspace.get("script_path", "")
            self.python_path = active_workspace.get("python_path", "")
            self.comfyui_port = active_workspace.get("comfyui_port", DEFAULT_COMFYUI_PORT)
            self.connect_port = saved_connect_port

    def apply_launch_config(self, workspace: WorkspaceInfo):
        self.mode = "launch"
        self.comfyui_path = os.path.dirname(workspace.script_path)
        self.python_path = os.path.dirname(workspace.python_path)
        self.comfyui_port = workspace.comfyui_port

    def apply_connect_config(self, connect_port: int):
        self.mode = "connect"
        self.connect_port = connect_port

    def install_grid_extension(self):
        if not self.comfyui_path:
            logger.info("[ComfyUIService] No ComfyUI path configured, skipping extension install")
            return

        custom_nodes_path = Path(self.comfyui_path, "custom_nodes")
        if not os.path.isdir(custom_nodes_path):
            if self.mode == "connect":
                logger.warning(f"[ComfyUIService] custom_nodes not found: {custom_nodes_path}")
                return
            sys.exit(f"Custom nodes path does not exist: {custom_nodes_path}")

        grid_dest_path = Path(custom_nodes_path, "ComfyUI-comfygrid")

        if grid_dest_path.exists():
            try:
                logger.info(f"[ComfyUIService] Removing invalid or existing path at {grid_dest_path}")
                shutil.rmtree(grid_dest_path)
            except Exception as e:
                logger.error(f"[ComfyUIService] Error removing existing path: {e}")

        logger.info(f"[ComfyUIService] Copying hook folder to {grid_dest_path}")
        try:
            shutil.copytree("hook", grid_dest_path, dirs_exist_ok=True)
        except Exception as e:
            logger.error(f"[ComfyUIService] Error copying hook folder: {e}")

        print(f"ComfyUI-comfygrid installed at {grid_dest_path}")

    async def run(self, *args):
        self.last_args = list(args)
        if self.mode == "connect":
            await self._connect_to_existing()
        else:
            await self._launch()

    async def restart(self):
        """Restart ComfyUI service"""
        if self.mode == "connect":
            logger.warning("[ComfyUIService] Restart not supported in 'connect' mode")
            return

        logger.info("[ComfyUIService] Restarting ComfyUI...")
        self.exit()
        self.url = None
        self.started = False
        self._broadcast_startup_log("Restarting ComfyUI...")

        asyncio.create_task(self.run(*self.last_args))

    async def _launch(self):
        if self.proc:
            self.exit()

        resolved_python_path = rel_to_abs(self.comfyui_path, self.python_path)

        env_comfy_args = os.environ.get("COMFYUI_ARGS", "")
        extra_args = self.last_args + shlex.split(env_comfy_args)

        comfy_args = [
            "--listen", "127.0.0.1",
            "--port", str(self.comfyui_port),
            "--windows-standalone-build",
            "--preview-method", "auto",
            *extra_args,
            "--disable-auto-launch",
        ]
        kwargs = parse_python_args(comfy_args)

        try:
            self.proc = await asyncio.to_thread(
                subprocess.Popen,
                [
                    Path(resolved_python_path, "python.exe"),
                    "-s",
                    Path(self.comfyui_path, "main.py"),
                    *comfy_args
                ],
                cwd=self.comfyui_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace"
            )
            self.output_directory = rel_to_abs(self.comfyui_path, kwargs.get("output-directory") or "output")

            threading.Thread(
                target=self._monitor_output,
                args=(self.proc,),
                daemon=True
            ).start()

            host = comfy_args[comfy_args.index("--listen") + 1]
            port = int(comfy_args[comfy_args.index("--port") + 1])
            ws_url = f"ws://{host}:{port}/ws?clientId=comfygrid-monitor"

            asyncio.create_task(self._monitor_comfyui_ws(ws_url))

            logging.info("ComfyUI launch initiated.")
        except Exception as e:
            logging.error(f"Error starting ComfyUI: {e}")
            raise

    async def _connect_to_existing(self):
        target_url = f"http://127.0.0.1:{self.connect_port}"
        if not target_url:
            logging.error("[ComfyUIService] mode is 'connect' but no url configured")
            return

        parsed = urlparse(target_url)

        ws_url = urlunparse(parsed._replace(scheme="ws", path="/ws", query="clientId=comfygrid-monitor"))

        self._broadcast_startup_log(f"Connecting to existing ComfyUI at {target_url} ...")
        self.url = target_url

        asyncio.create_task(self._monitor_comfyui_ws(ws_url))

    def _monitor_output(self, proc):
        if not proc:
            return
        for line in proc.stdout:
            stripped = line.strip()
            if stripped.startswith("{"):
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, dict) and "type" in parsed:
                        if not str(parsed["type"]).startswith("comfygrid"):
                            continue
                except ValueError:
                    pass

            print(line, end="")
            self._broadcast_startup_log(line.rstrip())

    async def _monitor_comfyui_ws(self, ws_url: str):
        """Monitor ComfyUI availability via its /ws WebSocket endpoint."""
        while True:
            try:
                async with websockets.connect(ws_url, open_timeout=5) as ws:
                    if not self.started:
                        self.started = True
                        logging.info("ComfyUI started successfully.")
                        await self._broadcast_status(True)
                    async for _ in ws:
                        pass
            except Exception as e:
                logging.debug(f"ComfyUI WS disconnected: {e}")

            if self.started:
                self.started = False
                logging.info("ComfyUI is restarting or offline...")
                await self._broadcast_status(False)

            await asyncio.sleep(1)

    def _broadcast_startup_log(self, message: str | dict):
        """Queue startup log message or JSON payload for broadcasting to WebSocket clients"""
        if self.startup_log_queue is not None:
            if isinstance(message, str):
                message = strip_ansi(message)
            self.startup_log_queue.put(message)

    async def _broadcast_status(self, started: bool):
        """Broadcast ComfyUI status to connected WebSocket clients"""
        payload = {"type": "comfygrid.comfyui_status", "started": started}
        disconnected = []
        for client in self.startup_log_clients:
            try:
                await client.send_json(payload)
            except Exception as e:
                logger.warning(f"[ComfyUIService] Failed to send status to client: {e}")
                disconnected.append(client)
        for client in disconnected:
            if client in self.startup_log_clients:
                self.startup_log_clients.remove(client)

    async def process_startup_logs(self):
        """Process queued startup logs and send to connected WebSocket clients"""
        logger.info("[ComfyUIService] process_startup_logs task started")
        while True:
            if self.startup_log_queue is None:
                await asyncio.sleep(0.1)
                continue
            try:
                message = self.startup_log_queue.get_nowait()

                if isinstance(message, dict):
                    payload = message
                else:
                    self.log_history.append(message)
                    if len(self.log_history) > 200:
                        self.log_history.pop(0)
                    payload = {"type": "comfygrid.startup_log", "message": message}

                disconnected = []
                for client in self.startup_log_clients:
                    try:
                        await client.send_json(payload)
                    except Exception as e:
                        logger.warning(f"[ComfyUIService] Failed to send log to client: {e}")
                        disconnected.append(client)

                for client in disconnected:
                    if client in self.startup_log_clients:
                        self.startup_log_clients.remove(client)
                        logger.info(f"[ComfyUIService] Removed disconnected client. Remaining: {len(self.startup_log_clients)}")

            except Exception:
                await asyncio.sleep(0.05)

    def exit(self):
        if not self.proc:
            return
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
