import io
import time
# pyrefly: ignore [missing-import]
from urllib.parse import urlencode

# pyrefly: ignore [missing-import]
import comfy.sample
# pyrefly: ignore [missing-import]
import execution
# pyrefly: ignore [missing-import]
import latent_preview
# pyrefly: ignore [missing-import]
from aiohttp import web
# pyrefly: ignore [missing-import]
from comfy_execution.utils import get_executing_context
# pyrefly: ignore [missing-import]
from server import PromptServer


def hook_sample():
    org_sample = comfy.sample.sample

    def sample_hook(*args, **kwargs):
        org_return = org_sample(*args, **kwargs)
        try:
            ctx = get_executing_context()
            PromptServer.instance.send_sync("comfygrid.sampling_info", {
                "job_id": ctx.prompt_id if ctx else "",
                "node_id": ctx.node_id if ctx else "",
                "list_index": ctx.list_index if ctx else None,
                **{key: value for key, value in kwargs.items() if type(value) is str or type(value) is int or type(value) is float},
            })
        except Exception as e:
            print(f"Error sending message: {e}")
        return org_return

    comfy.sample.sample = sample_hook


def hook_sample_custom():
    org_sample_custom = comfy.sample.sample_custom

    def sample_custom_hook(*args, **kwargs):
        org_return = org_sample_custom(*args, **kwargs)
        try:
            ctx = get_executing_context()
            PromptServer.instance.send_sync("comfygrid.sampling_info", {
                "job_id": ctx.prompt_id if ctx else "",
                "node_id": ctx.node_id if ctx else "",
                "list_index": ctx.list_index if ctx else None,
                **{key: value for key, value in kwargs.items() if type(value) is str or type(value) is int or type(value) is float},
            })
        except Exception as e:
            print(f"Error sending message: {e}")
        return org_return

    comfy.sample.sample_custom = sample_custom_hook


def hook_get_output_data():
    org_get_output_data = execution.get_output_data

    async def get_output_data(*args, **kwargs):
        output, ui, has_subgraph, literal_bool = await org_get_output_data(*args, **kwargs)
        try:
            if "images" in ui:
                image_datas = []
                for save_info in ui["images"]:
                    params = {k: save_info[k] for k in ['filename', 'subfolder', 'type']}
                    image_datas.append([f"/api/view?{urlencode(params)}"])

                PromptServer.instance.send_sync(
                    "comfygrid.image_generated",
                    {
                        "job_id": args[0],
                        "node_id": args[1],
                        "images": image_datas
                    }
                )
        except Exception as e:
            print(f"Error sending message: {e}")

        return output, ui, has_subgraph, literal_bool

    execution.get_output_data = get_output_data


preview_cache = {"data": b"", "type": "image/jpeg"}


@PromptServer.instance.routes.get("/comfygrid/preview")
async def get_comfygrid_preview(request):
    return web.Response(body=preview_cache["data"], content_type=preview_cache["type"])


def broadcast_preview(image, img_type_str="JPEG"):
    if image is None:
        return
    try:
        buf = io.BytesIO()
        image.save(buf, format=img_type_str)
        preview_cache["data"] = buf.getvalue()
        preview_cache["type"] = f"image/{img_type_str.lower()}"

        ctx = get_executing_context()
        PromptServer.instance.send_sync("comfygrid.update_preview", {
            "job_id": ctx.prompt_id if ctx else "",
            "node_id": ctx.node_id if ctx else "",
            "timestamp": time.time()
        })
    except Exception as e:
        print(f"Error broadcasting preview: {e}")


def hook_preview_to_image():
    org_preview_to_image = latent_preview.preview_to_image

    def preview_to_image(self, *args, **kwargs):
        org_return = org_preview_to_image(self, *args, **kwargs)
        if org_return is not None:
            broadcast_preview(org_return, "JPEG")
        return org_return

    latent_preview.preview_to_image = preview_to_image


def hook_decode_latent_to_preview():
    org_decode_latent_to_preview_image = (
        latent_preview.LatentPreviewer.decode_latent_to_preview_image
    )

    def decode_latent_to_preview_image(self, *args, **kwargs):
        org_return = org_decode_latent_to_preview_image(self, *args, **kwargs)
        try:
            img_type, img_data, _ = org_return
            if img_data is not None:
                broadcast_preview(img_data, img_type)
        except Exception:
            pass
        return org_return

    latent_preview.LatentPreviewer.decode_latent_to_preview_image = decode_latent_to_preview_image


def hook_comfygrid():
    hook_sample()
    hook_sample_custom()
    hook_get_output_data()
    hook_preview_to_image()
    hook_decode_latent_to_preview()
