from typing import Any

from comfygrid.domain import options


class Options:
    data: dict[str, Any]

    def __init__(self):
        self.data = {}


opts: Options = Options()
ext_forms: dict[tuple[str, str], dict[str, options.OptionForms]] = {}


def register_option(id: str, name: str, options: options.OptionInfo):
    _id = id.replace(" ", "_")
    ext_forms[(_id, name)] = options.forms
    opts.data.update(options.data)
