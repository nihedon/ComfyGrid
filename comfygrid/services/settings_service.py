from pathlib import Path

import toml

from comfygrid.domain import state

OPTIONS_PATH = Path("config", "options.toml")
SETTINGS_PATH = Path("config", "settings.toml")


def get_options_payload() -> dict:
    options = toml.load(OPTIONS_PATH)
    settings = toml.load(SETTINGS_PATH) if SETTINGS_PATH.exists() else {}
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
