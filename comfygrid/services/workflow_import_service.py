import asyncio
import ipaddress
import json
import socket
from dataclasses import dataclass
from pathlib import PurePosixPath
from urllib.parse import unquote, urljoin

import httpcore
import httpx

MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
DOWNLOAD_TIMEOUT = 30
MAX_REDIRECTS = 5


class WorkflowImportError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def is_public_address(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.is_site_local:
            return False
        if ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        elif ip.sixtofour or ip.teredo:
            return False
    return ip.is_global and not (ip.is_multicast or ip.is_reserved)


class PublicNetworkBackend(httpcore.AnyIOBackend):
    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        addresses = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
        if not addresses or any(not is_public_address(info[4][0]) for info in addresses):
            raise WorkflowImportError(400, "Only public internet addresses are allowed.")
        # Connect to the validated IP, without a second DNS lookup of the hostname.
        # HTTPCore still uses the original hostname for Host and TLS verification.
        last_error = None
        for address in dict.fromkeys(info[4][0] for info in addresses):
            try:
                return await super().connect_tcp(address, port, timeout, local_address, socket_options)
            except httpcore.ConnectError as error:
                last_error = error
        raise last_error


@dataclass(frozen=True)
class ImportedFile:
    content: bytes
    filename: str
    media_type: str


def validate_url(value: str) -> httpx.URL:
    try:
        if len(value) > 8192 or any(ord(char) < 33 for char in value):
            raise ValueError
        url = httpx.URL(value)
        if url.scheme not in ("http", "https") or not url.host or url.userinfo:
            raise ValueError
        if url.port is not None and not 1 <= url.port <= 65535:
            raise ValueError
        try:
            ipaddress.ip_address(url.host)
        except ValueError:
            pass
        else:
            if not is_public_address(url.host):
                raise WorkflowImportError(400, "Only public internet addresses are allowed.")
        return url.copy_with(fragment=None)
    except (ValueError, httpx.InvalidURL) as error:
        raise WorkflowImportError(400, "Invalid HTTP(S) URL.") from error


def classify_file(content: bytes, url: httpx.URL) -> ImportedFile:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        suffix, media_type = ".png", "image/png"
    elif content.startswith(b"\xff\xd8\xff"):
        suffix, media_type = ".jpg", "image/jpeg"
    elif content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        suffix, media_type = ".webp", "image/webp"
    elif content.startswith((b"\xff\x0a", b"\x00\x00\x00\x0cJXL \r\n\x87\n")):
        suffix, media_type = ".jxl", "image/jxl"
    else:
        try:
            if not isinstance(json.loads(content), dict):
                raise ValueError
        except (ValueError, UnicodeError, RecursionError) as error:
            raise WorkflowImportError(415, "The URL must return JSON or a supported image.") from error
        suffix, media_type = ".json", "application/json"
    name = PurePosixPath(unquote(url.path)).name.replace("\\", "_")
    name = "".join(char for char in name if char.isprintable())[:180]
    stem = PurePosixPath(name).stem if name else "workflow"
    return ImportedFile(content, (stem or "workflow") + suffix, media_type)


async def _download(url: str) -> ImportedFile:
    async with httpcore.AsyncConnectionPool(network_backend=PublicNetworkBackend(), max_connections=1) as client:
        for redirect in range(MAX_REDIRECTS + 1):
            target = validate_url(url)
            async with client.stream(
                "GET", str(target),
                headers={"Accept": "application/json,image/*,text/plain", "Accept-Encoding": "identity", "User-Agent": "ComfyGrid"},
                extensions={"timeout": {"connect": 10, "read": 10, "write": 10, "pool": 10}},
            ) as response:
                headers = {key.lower(): value for key, value in response.headers}
                if response.status in (301, 302, 303, 307, 308):
                    location = headers.get(b"location")
                    if not location or redirect == MAX_REDIRECTS:
                        raise WorkflowImportError(502, "Invalid or excessive redirects.")
                    url = urljoin(str(target), location.decode("latin-1"))
                    continue
                if response.status != 200:
                    raise WorkflowImportError(502, f"Remote server returned HTTP {response.status}.")
                if headers.get(b"content-encoding", b"identity").lower() != b"identity":
                    raise WorkflowImportError(415, "Compressed responses are not supported.")
                length = headers.get(b"content-length")
                if length is not None:
                    try:
                        size = int(length)
                    except ValueError as error:
                        raise WorkflowImportError(502, "Invalid remote content length.") from error
                    if size > MAX_DOWNLOAD_BYTES:
                        raise WorkflowImportError(413, "Remote file is too large.")
                content = bytearray()
                async for chunk in response.aiter_stream():
                    if len(content) + len(chunk) > MAX_DOWNLOAD_BYTES:
                        raise WorkflowImportError(413, "Remote file is too large.")
                    content.extend(chunk)
                return await asyncio.to_thread(classify_file, bytes(content), target)
    raise WorkflowImportError(502, "Could not download the workflow.")


async def download_workflow(url: str) -> ImportedFile:
    try:
        return await asyncio.wait_for(_download(url), timeout=DOWNLOAD_TIMEOUT)
    except (asyncio.TimeoutError, httpcore.TimeoutException) as error:
        raise WorkflowImportError(504, "Remote workflow download timed out.") from error
    except (httpcore.NetworkError, httpcore.ProtocolError, OSError) as error:
        raise WorkflowImportError(502, "Could not download the remote workflow.") from error
