from fastapi import FastAPI


callbacks = {
    "on_ui_settings": [],
    "on_app_started": [],
}


def on_ui_settings(func):
    if 'on_ui_settings' not in callbacks:
        callbacks['on_ui_settings'] = []
    callbacks['on_ui_settings'].append(func)
    return func


def on_app_started(func):
    if 'on_app_started' not in callbacks:
        callbacks['on_app_started'] = []
    callbacks['on_app_started'].append(func)
    return func


def call_callbacks(event_name, app: FastAPI, *args, **kwargs):
    if event_name in callbacks:
        for func in callbacks[event_name]:
            try:
                func(app, *args, **kwargs)
            except Exception as e:
                print(f"Error in callback '{func.__name__}' for event '{event_name}': {e}")
