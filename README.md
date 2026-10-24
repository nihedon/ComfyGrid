[![ja](https://img.shields.io/badge/lang-ja-009688.svg)](README.ja.md)

# ComfyGrid

[![Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/nihedon)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/nihedon)

<p align="center">
<img width="148" alt="Image" src="https://github.com/user-attachments/assets/285015de-776f-4c47-a30f-73d08f9ae42d" />
</p>

**Note: This is currently in beta. Unexpected bugs or specification changes may occur.**

ComfyGrid provides a customizable interface for operating ComfyUI workflows, with a layout inspired by Stable Diffusion WebUI. Arrange frequently used nodes and widgets, adjust inputs, and generate images without navigating the node graph for every operation.

Create and connect your workflow in ComfyUI first. ComfyGrid makes existing workflows easier to operate; it does not replace workflow construction or install the custom nodes and models required by a workflow.

![ComfyGrid with input images, prompts, and a generated result](https://github.com/user-attachments/assets/276b1f3b-1bf4-4ae4-98a6-dc072d073f11)

[https://github.com/user-attachments/assets/0d16ae41-f90e-46f1-a343-bbce9a3cf9d9](https://github.com/user-attachments/assets/e8ba9531-e3f8-4cc5-b9cc-15e8d2d2a6ca)

Screenshots use the Lumen theme.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation and Setup](#installation-and-setup)
- [Interface Overview](#interface-overview)
- [Basic Operations](#basic-operations)
- [Saving and Loading](#saving-and-loading)
- [Settings](#settings)
- [Launch Options](#launch-options)
- [Troubleshooting](#troubleshooting)
- [Technical Notes and Credits](#technical-notes-and-credits)
- [Feedback and Support](#feedback-and-support)

## Features

- Arrange nodes on resizable GridStack boards, or keep them in their group layout.
- Operate the embedded ComfyUI interface and switch between its open workflows from ComfyGrid.
- Use plain text, CodeMirror prompts, editable JSON, and Ollama translation, with optional PromptPilot tag completion.
- Browse model thumbnails and metadata, manage workflow files, and inspect image metadata.
- View generation progress and results, edit images and masks, and save images with metadata.
- Support widgets including color pickers, Bounding Boxes, Camera Angle, Load 3D, resolution previews, and Markdown text previews.

## Requirements

- **OS:** Windows. macOS is not currently a supported release target.
- **Browser:** A Chromium-based browser such as Google Chrome or Microsoft Edge.
- **ComfyUI:** A working ComfyUI Portable installation. **Tested with ComfyUI v0.42.0.** This is a tested version, not a guarantee of compatibility with every other version.
- **Ollama:** Optional; required only for Ollama translation.

## Installation and Setup

### Download and Launch

1. Download `ComfyGrid-portable-x.x.x.zip` from the [Releases page](https://github.com/nihedon/ComfyGrid/releases).
2. Extract the archive to a writable folder.
3. Run `run.bat` in the extracted folder.
4. Open `http://127.0.0.1:6210/comfygrid/` in your browser.

The portable release is intended for regular use. `frontend-dist-x.x.x.zip` contains only the pre-built frontend for users running the repository with their own Python environment; it is not a complete portable package. The former standalone `exe` distribution has been discontinued.

### Create a Profile

![Setup screen with a sample profile](https://github.com/user-attachments/assets/3960736f-be97-4dfc-96c7-cfb454cb4c31)

The profile name and paths shown are examples. Use the paths for your own ComfyUI installation.

1. Select **+ New Profile** on the setup screen and enter a name.
2. Set **ComfyUI main.py** to the `main.py` of the installation you want to launch.
3. Set the Python executable to the Python used by that ComfyUI installation.
4. Adjust the ComfyUI port and launch arguments if necessary.
5. Save the profile, then launch ComfyUI using it. Saving alone does not start ComfyUI.

Example paths for ComfyUI Portable:

```text
ComfyUI main.py: D:\ComfyUI_windows\ComfyUI\main.py
Python:         D:\ComfyUI_windows\python_embeded\python.exe
```

Save multiple profiles for different installations or launch settings. Use the profile menu to delete a registration; this does not delete the ComfyUI installation. The global menu lets you return to setup.

## Interface Overview

| Tab | Purpose |
| --- | --- |
| Grid | Adjust inputs, arrange nodes, and view generated results. |
| ComfyUI | Work directly with the embedded ComfyUI node graph. |
| Files | Manage saved workflows and browse model details. |
| Image Info | Inspect image metadata and generation information. |
| Settings | Configure appearance, saving, Ollama, PromptPilot, and other options. |

The header contains the global menu, open-workflow selector, generation controls, and progress information. ComfyUI top-level groups can be displayed as tabs in Grid, depending on your settings.

## Basic Operations

### Load a Workflow and Generate

1. Load or create a working workflow in **ComfyUI**, or open a saved workflow from **Files → Workflows**.
2. Switch to **Grid** and adjust the node inputs you need.
3. Use the generation controls or press **Ctrl+Enter** to queue generation.
4. Check progress and view the results in the gallery.

You can also drop a workflow JSON file or an image containing a workflow onto the header. Outside text-entry areas, pasting JSON, an external URL, or an image asks for confirmation before attempting to load a workflow. Images without embedded workflows cannot restore a workflow.

### Arrange Nodes

Moving a node to GridStack separates its placement from the normal group layout. Click the movement button at the right end of its header and select Global space or Tab space. You can also move it from the title area's context menu.

![Choose a GridStack destination from the node header](https://github.com/user-attachments/assets/6bd5454b-71f0-4b28-94bc-45c9f8060b58)

- **Global space:** The GridStack board above the group tabs. Its nodes remain visible when switching tabs within Grid, making it useful for shared controls.
- **Tab space:** A GridStack board inside the destination group's tab, for controls used in that tab.
- **Return to tab:** Remove the node from GridStack and return it to the normal group layout.

![Global space, tab space, and normal placement](https://github.com/user-attachments/assets/54dc6387-f8e8-4fa3-a74d-898881edab43)

In this sample, Shared Generation Settings above the tabs is in Global space. Inside the Generation tab, Image Size is on its tab board and Sampling Settings below it uses normal placement. Switching to High Resolution changes the tab contents but keeps the global node visible.

Drag GridStack node headers to reposition nodes and use their resize handles to change their size. Moving a node into tab space or returning it to a tab activates the destination tab. When tab boards are shared, the destination is the Nodes tab.

For nodes containing a custom text widget and other widgets, the custom text widget can also be moved independently. Its movement controls affect that widget, not the entire ComfyUI node.

Nodes containing DOM widgets show an additional fit-content toggle while on GridStack. It is OFF by default; enable it to constrain DOM content to the node's available size. Very small nodes may not have enough room for all controls.

### Use Node Controls

- Change node or group modes between Normal, Mute, and Bypass. Simplified node-mode controls are available in Settings.
- Double-click a node title to rename it. Right-click the title area for actions such as duplication, collapse, and deletion.
- Show advanced inputs on nodes that provide them.
- Drag supported numeric fields to adjust values, or click to edit with the value selected. Hold **Shift** for finer adjustments or **Ctrl** for faster changes.
- Use the swap icon between adjacent numeric `width` and `height` fields to exchange their values.

Node edits, including deletion, affect the underlying ComfyUI workflow, not just its presentation in ComfyGrid.

### Choose a Text Mode

| Mode | Editor | Tags |
| --- | --- | --- |
| Text | Plain textarea | Not available |
| Prompt | CodeMirror | Available; ON by default when selecting Prompt |
| JSON | CodeMirror with JSON editing and automatic formatting | Available; OFF by default |
| Ollama | CodeMirror for translation input | Not available |

![Prompt and JSON editors with Tags ON and OFF](https://github.com/user-attachments/assets/53a9ed17-c3e8-40ff-bdab-1e560b671f54)

The upper Prompt editor has Tags ON (highlighted Tag icon); the lower JSON editor has Tags OFF. Choose the editor mode from its name and toggle tag completion separately using the adjacent Tag icon. Tags can also be enabled for JSON.

Use the **Tag icon** to toggle PromptPilot completion independently of the Prompt/JSON editor mode. Completion also follows the global PromptPilot enable setting. With Tags enabled, coloring follows the prompt-color settings. With Tags disabled, CodeMirror colors text segments separated by punctuation and line breaks.

Ollama settings include the server URL, model, system prompt, translation timing, and fixed/random seed. Widget-specific settings can override the available global defaults. Original input and translated output are kept separately.

### Browse Models

Use model-selection controls on a node to change its model. Supported controls offer thumbnails and model information.

In **Files**, clicking cards under Models, LoRAs, Embeddings, or Hypernetworks opens model details. These cards do not directly apply models or insert text into prompts. Refresh the model list after adding model files.

### Inspect Image Information

Open an image in **Image Info**, or send it from the gallery using the information button, to inspect the image and its embedded metadata. Expand JSON fields to review generation inputs. When supported workflow metadata is present, you can send it to ComfyUI.

![Generated image and embedded prompt metadata](https://github.com/user-attachments/assets/f6a3929e-12c7-425f-8bd1-025bc8bcee14)

## Saving and Loading

These operations save different things:

| Operation | What it saves |
| --- | --- |
| Gallery save / Ctrl+S | The selected result to the configured server-side image save directory. |
| Gallery download | The selected result through your browser. |
| Ctrl+Shift+S | The current workflow to ComfyUI's workflow list, together with a captured thumbnail. Existing workflows are overwritten; unsaved workflows ask for a name. |
| Global menu: workflow export | A workflow JSON file. |
| Global menu: layout export | ComfyGrid layout settings only. |
| Global menu: combined export | A workflow together with its ComfyGrid layout. |

ComfyGrid layout information is also stored in workflow metadata. For a portable backup of both the workflow and its presentation, use the combined export. A layout-only file does not contain a complete ComfyUI workflow.

**Files → Workflows** lets you browse saved workflows and organize folders and filenames. In Settings, configure the image save directory, subdirectory naming, filename format, image format, quality, and metadata embedding.

| Shortcut | Action |
| --- | --- |
| Ctrl+Enter | Queue generation |
| Ctrl+S | Save the current gallery image |
| Ctrl+Shift+S | Save the current workflow and thumbnail |
| Ctrl+O | Import a ComfyGrid layout from a JSON file |

Shortcuts apply in the ComfyGrid page. Editors and the embedded ComfyUI interface may handle their own shortcuts.

Ctrl+O restores the layout portion of a layout or combined-export file; it does not load the workflow graph. Use ComfyUI, Files, or the header drop area to load a workflow.

## Settings

Settings include language and theme, group tabs, simplified node modes, GridStack grid/dot backgrounds, gallery and model thumbnail sizing, system monitor visibility, image saving, Ollama, and PromptPilot.

Board-sharing and layout choices are workflow-specific. Layout exports include the relevant ComfyGrid presentation settings; global application settings are managed separately.

## Launch Options

When running `python main.py`, the following application arguments are available:

| Argument | Description | Default |
| --- | --- | --- |
| `--host` | Backend API bind address. This alone does not configure public access through Caddy. | `127.0.0.1` |
| `--port` | Browser-facing reverse-proxy port. | `6210` |
| `--server-port` | Internal backend API port. | `8000` |
| `--log-level` | Logging level, such as `INFO` or `DEBUG`. | `INFO` |
| `--extension-update` | Enable updates for unpinned recommended ComfyGrid extensions during startup preparation. | OFF |

Set ComfyUI launch arguments in the setup profile. `--comfyui-args` is not a dedicated ComfyGrid command-line option.

## Troubleshooting

- **Startup does not finish:** Check the loading screen and terminal logs. File downloads can take time. Use Retry if recovery controls appear, or return to setup and verify the profile paths and port.
- **A workflow cannot generate:** Verify that it works in ComfyUI and that its required models and custom nodes are installed.
- **New models are missing:** Refresh the model list, then check the relevant ComfyUI model directories.
- **Image saving fails:** Check the configured save directory and write permissions. Server-side save and browser download use different destinations.
- **Ollama translation fails:** Verify that Ollama is running, the server URL is reachable, and the chosen model is installed; check the error notification for details.

The global menu offers separate actions to reload the embedded ComfyUI page or restart its Python process. These do not reload the entire ComfyGrid page.

## Technical Notes and Credits

ComfyGrid uses [Caddy](https://caddyserver.com/) as a reverse proxy to expose ComfyGrid and ComfyUI through a single browser-facing port. During launch preparation, it installs its integration into `custom_nodes/ComfyUI-comfygrid` for workflow and widget integration.

PromptPilot's Danbooru tag completion is integrated into CodeMirror; you do not need to install the former `comfygrid-prompt-pilot` extension separately. It is based on [sd-webui-prompt-pilot](https://github.com/nihedon/sd-webui-prompt-pilot).

See [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) for third-party license notices.

## Feedback and Support

Please report bugs and feature requests through [GitHub Issues](https://github.com/nihedon/ComfyGrid/issues). Include the ComfyGrid/ComfyUI versions, reproduction steps, and relevant logs. Remove private paths, prompts, or other sensitive information before posting.

If you would like to support development:

- [Ko-fi (nihedon)](https://ko-fi.com/nihedon)
- [Buy Me a Coffee (nihedon)](https://buymeacoffee.com/nihedon)
