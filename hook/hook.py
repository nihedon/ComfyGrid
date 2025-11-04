# pyrefly: ignore [missing-import]
import comfy.sample
# pyrefly: ignore [missing-import]
# from comfy.cli_args import args
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


def hook_comfygrid():
    hook_sample()
    hook_sample_custom()
