import locale
import os
from pathlib import Path

import orjson

_translations = {}
_current_lang = None


def load_translations(lang=None):
    global _translations, _current_lang

    if lang is None:
        lang = os.getenv('LANG', locale.getdefaultlocale()[0])
        if lang:
            lang = lang.split('_')[0].split('.')[0]
        else:
            lang = 'en'

    _current_lang = lang
    translation_file = Path("i18n") / f"{lang}.json"

    if not translation_file.exists():
        translation_file = Path("i18n") / "en.json"
        _current_lang = 'en'

    try:
        with open(translation_file, "r", encoding="utf-8") as f:
            _translations = orjson.loads(f.read())
    except Exception as e:
        print(f"Warning: Failed to load translation file '{translation_file}': {e}")
        _translations = {}


def _(key: str, **kwargs) -> str:
    if not _translations:
        load_translations()

    message = _translations.get(key, key)

    if kwargs:
        try:
            message = message.format(**kwargs)
        except KeyError as e:
            print(f"Warning: Missing placeholder in translation '{key}': {e}")

    return message


def get_current_language() -> str:
    if _current_lang is None:
        load_translations()
    return _current_lang  # type: ignore


def set_language(lang: str):
    load_translations(lang)
