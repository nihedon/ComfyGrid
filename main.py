from fastapi import FastAPI

from comfygrid.main import create_app, run


class LazyApp:
    """ASGI app proxy that avoids creating the FastAPI app during module import."""

    _app: FastAPI | None = None

    def _get_app(self) -> FastAPI:
        if self._app is None:
            self._app = create_app()
        return self._app

    async def __call__(self, scope, receive, send):
        await self._get_app()(scope, receive, send)

    def __getattr__(self, name: str):
        return getattr(self._get_app(), name)


app = LazyApp()


if __name__ == "__main__":
    run()
