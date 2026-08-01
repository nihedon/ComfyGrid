from pathlib import Path

import toml

from comfygrid.domain import state

OPTIONS_PATH = Path("config", "options.toml")
SETTINGS_PATH = Path("config", "settings.toml")


def flatten_dict(d: dict, parent_key: str = '', sep: str = '.') -> dict:
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict) and "type" not in v and not (len(v) == 2 and "name" in v and "forms" in v):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def get_options_payload() -> dict:
    options = flatten_dict(toml.load(OPTIONS_PATH))
    settings = flatten_dict(toml.load(SETTINGS_PATH)) if SETTINGS_PATH.exists() else {}
    state.opts.data.update(settings)

    return {
        "opts": state.opts.data,
        "forms": options,
        "ext_forms": {
            id: {
                "name": name,
                "forms": {key: opt_forms.form for key, opt_forms in ext_forms.items()},
            }
            for (id, name), ext_forms in state.ext_forms.items()
        },
    }


def save_options(settings: dict) -> None:
    state.opts.data.update(settings)
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        toml.dump(state.opts.data, f)
