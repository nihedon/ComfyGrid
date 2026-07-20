[![ja](https://img.shields.io/badge/lang-ja-009688.svg)](README.ja.md)

# ComfyGrid

[![Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/nihedon)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/nihedon)

**Note: This is currently in beta. Unexpected bugs or specification changes may occur.**

<img width="1300" height="900" alt="Image" src="https://github.com/user-attachments/assets/b638556c-d29e-4c77-b7d0-294917159eab" />

<img width="1300" height="900" alt="Image" src="https://github.com/user-attachments/assets/8c03f760-fcc0-46f1-8b49-f5da1a017349" />

This application integrates with ComfyUI (Portable version), allowing you to place and interact with ComfyUI widgets in a grid layout.
The UI structure is heavily inspired by Stable Diffusion WebUI.

## Key Features

The primary goal is to consolidate ComfyUI node operations into a single screen, enabling image generation without the need to consciously connect nodes.

- **Free Widget Placement:** Extract only the necessary node widgets and place them on the grid.
- **Visual Model Selection:** Select from a thumbnail list or view thumbnails by hovering over the dropdown list.
- **Progress Visualization:** Display the currently executing node and progress status from ComfyUI on the UI.
- **Direct Control via ComfyUI Tab:** Switch tabs to directly operate the embedded ComfyUI interface.

Additionally, it includes `comfygrid-prompt-pilot`, a ComfyGrid adaptation of the Danbooru tag completion extension `sd-webui-prompt-pilot` originally created for Stable Diffusion WebUI.
*Note: The tag suggestion feature is disabled in this ported version.*

`sd-webui-prompt-pilot` [https://github.com/nihedon/sd-webui-prompt-pilot](https://github.com/nihedon/sd-webui-prompt-pilot)

`comfygrid-prompt-pilot` [https://github.com/nihedon/comfygrid-prompt-pilot](https://github.com/nihedon/comfygrid-prompt-pilot)

### ComfyUI Feature Integration

The following basic operations in ComfyUI can be directly modified and reflected from within ComfyGrid:

- Renaming nodes/groups
- Changing node/group modes (Always, Mute, Bypass)
- Changing group colors

## System Requirements

- OS: Windows
- Browser: Chromium-based browsers (Google Chrome, Microsoft Edge, etc.)
- Prerequisite: ComfyUI 0.24.x (Portable version) must be functioning properly.

## Technical Architecture

- Uses [Caddy](https://caddyserver.com/) internally as a reverse proxy. This unifies the communication between this application and ComfyUI to a single port.

## Launch Instructions (Standalone Version)

1. Download the latest `ComfyGrid-portable-x.x.x.zip` from the [Releases page](../../releases).
2. Extract the downloaded Zip file.
3. Run `run.bat` inside the extracted folder.
4. Open `http://127.0.0.1:6210/comfygrid/` in your browser.

_Note: A setup screen will appear on startup asking you to specify the ComfyUI (Portable) script path and Python executable._

<img width="500" height="500" alt="Image" src="https://github.com/user-attachments/assets/a112c110-839f-417d-bb0e-83a76b05d882" />

## Launch Options (Command Line Arguments)

You can specify the following arguments when running `comfygrid.exe` (or `main.py`).

| Argument             | Description                                                                 | Default Value |
| -------------------- | --------------------------------------------------------------------------- | ------------- |
| `--port`             | Specifies the communication port (Caddy) accessed from the browser.         | `6210`        |
| `--server-port`      | Specifies the internal port for the backend API.                            | `8000`        |
| `--log-level`        | Specifies the logging output level (`INFO`, `DEBUG`, etc.).                 | `INFO`        |
| `--extension-update` | Automatically updates the ComfyGrid extension for ComfyUI on startup.       | (None)        |
| `--comfyui-args`     | Specifies the launch arguments to pass to the ComfyUI instance as a string. | `""`          |

## Bug Reports & Feedback

We welcome bug reports and feature requests through GitHub Issues.

## Support

If you would like to support development, please consider donating via the links below. It would be greatly appreciated!

- [Ko-fi (nihedon)](https://ko-fi.com/nihedon)
- [Buy Me a Coffee (nihedon)](https://buymeacoffee.com/nihedon)
