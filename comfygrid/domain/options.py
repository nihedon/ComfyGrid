from typing import Any


class OptionForms:
    form = {}

    @staticmethod
    def text(label: str, default: str, hint: str = "", placeholder: str = "", **kwargs):
        opt_types = OptionForms()
        opt_types._text(label, default, hint, placeholder, **kwargs)
        return opt_types

    def _text(self, label: str, default: str, hint: str = "", placeholder: str = "", **kwargs):
        self.form = {
            "type": "text",
            "label": label,
            "default": default,
            "hint": hint,
            "placeholder": placeholder,
            **kwargs
        }

    @staticmethod
    def textarea(label: str, default: str, hint: str = "", placeholder: str = "", lines: int = 4, **kwargs):
        opt_types = OptionForms()
        opt_types._textarea(label, default, hint, placeholder, lines, **kwargs)
        return opt_types

    def _textarea(self, label: str, default: str, hint: str = "", placeholder: str = "", lines: int = 4, **kwargs):
        self.form = {
            "type": "textarea",
            "label": label,
            "default": default,
            "hint": hint,
            "placeholder": placeholder,
            "lines": lines,
            **kwargs
        }

    @staticmethod
    def number(label: str, default: float, minimum: float, maximum: float, step: float = 1, hint: str = "", **kwargs):
        opt_types = OptionForms()
        opt_types._number(label, default, minimum, maximum, step, hint, **kwargs)
        return opt_types

    def _number(self, label: str, default: float, minimum: float, maximum: float, step: float = 1, hint: str = "", **kwargs):
        self.form = {
            "type": "number",
            "label": label,
            "default": default,
            "minimum": minimum,
            "maximum": maximum,
            "step": step,
            "hint": hint,
            **kwargs
        }

    @staticmethod
    def checkbox(label: str, default: bool = False, hint: str = "", **kwargs):
        opt_types = OptionForms()
        opt_types._checkbox(label, default, hint, **kwargs)
        return opt_types

    def _checkbox(self, label: str, default: bool = False, hint: str = "", **kwargs):
        self.form = {
            "type": "checkbox",
            "label": label,
            "default": default,
            "hint": hint,
            **kwargs
        }

    @staticmethod
    def checkbox_group(label: str, default: list[str], choices: list[str], hint: str = "", **kwargs):
        opt_types = OptionForms()
        opt_types._checkbox_group(label, default, choices, hint, **kwargs)
        return opt_types

    def _checkbox_group(self, label: str, default: list[str], choices: list[str], hint: str = "", **kwargs):
        self.form = {
            "type": "checkbox_group",
            "label": label,
            "default": default,
            "choices": choices,
            "hint": hint,
            **kwargs
        }

    @staticmethod
    def dropdown(label: str, default: str, choices: list[str], hint: str = "", **kwargs):
        opt_types = OptionForms()
        opt_types._dropdown(label, default, choices, hint, **kwargs)
        return opt_types

    def _dropdown(self, label: str, default: str, choices: list[str], hint: str = "", **kwargs):
        self.form = {
            "type": "dropdown",
            "label": label,
            "default": default,
            "choices": choices,
            "hint": hint,
            **kwargs
        }

    @staticmethod
    def radio(label: str, default: str, choices: list[str], hint: str = "", **kwargs):
        opt_types = OptionForms()
        opt_types._radio(label, default, choices, hint, **kwargs)
        return opt_types

    def _radio(self, label: str, default: str, choices: list[str], hint: str = "", **kwargs):
        self.form = {
            "type": "radio",
            "label": label,
            "default": default,
            "choices": choices,
            "hint": hint,
            **kwargs
        }

    @staticmethod
    def slider(label: str, default: float, minimum: float, maximum: float, step: float = 1, hint: str = "", **kwargs):
        opt_types = OptionForms()
        opt_types._slider(label, default, minimum, maximum, step, hint, **kwargs)
        return opt_types

    def _slider(self, label: str, default: float, minimum: float, maximum: float, step: float = 1, hint: str = "", **kwargs):
        self.form = {
            "type": "slider",
            "label": label,
            "default": default,
            "minimum": minimum,
            "maximum": maximum,
            "step": step,
            "hint": hint,
            **kwargs
        }

    @staticmethod
    def color(label: str, default: str = "#FFFFFF", hint: str = "", **kwargs):
        opt_types = OptionForms()
        opt_types._color(label, default, hint, **kwargs)
        return opt_types

    def _color(self, label: str, default: str = "#FFFFFF", hint: str = "", **kwargs):
        self.form = {
            "type": "color",
            "label": label,
            "default": default,
            "hint": hint,
            **kwargs
        }


class OptionInfo:
    data: dict[str, Any]
    forms: dict[str, OptionForms]
    _current_group: str | None

    def __init__(self) -> None:
        self.data = {}
        self.forms = {}
        self._current_group = None

    class _SectionContext:
        def __init__(self, opts: "OptionInfo", name: str):
            self.opts = opts
            self.name = name
            self.prev = None

        def __enter__(self):
            self.prev = self.opts._current_group
            self.opts._current_group = self.name

        def __exit__(self, exc_type, exc_val, exc_tb):
            self.opts._current_group = self.prev

    def section(self, name: str):
        return self._SectionContext(self, name)

    def set_option(self, key: str, opt_forms: OptionForms):
        self.data[key] = opt_forms.form.get("default", None)
        if self._current_group is not None and "group" not in opt_forms.form:
            opt_forms.form["group"] = self._current_group
        self.forms[key] = opt_forms

    def get_option(self, key: str) -> OptionForms | None:
        return self.forms.get(key, None)

    def set_value(self, key: str, value: Any):
        self.data[key] = value

    def get_value(self, key: str) -> Any | None:
        return self.data.get(key, None)
