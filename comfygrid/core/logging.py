import logging
import logging.config
from pathlib import Path

from comfygrid.core.config import AppSettings


def configure_logging(settings: AppSettings) -> None:
    logs_dir = Path("logs")
    logs_dir.mkdir(exist_ok=True)
    try:
        logging.config.fileConfig(Path("config", "logging.conf"))
    except Exception as e:
        logging.basicConfig(level=settings.log_level)
        logging.warning("Failed to load logging config. Falling back to basic logging: %s", e)
    logging.getLogger().setLevel(settings.log_level)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("websockets").setLevel(logging.WARNING)
    logging.getLogger("websockets.client").setLevel(logging.WARNING)
