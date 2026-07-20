import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path("config") / "comfygrid.db"

_CREATE_MODEL_META = """
CREATE TABLE IF NOT EXISTS model_meta (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    full_path   TEXT NOT NULL UNIQUE,
    url         TEXT,
    nsfw        INTEGER NOT NULL DEFAULT 0,
    rate        INTEGER,
    favorite    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_MODEL_TRAINED_WORDS = """
CREATE TABLE IF NOT EXISTS model_trained_words (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    full_path   TEXT NOT NULL,
    word        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (full_path) REFERENCES model_meta(full_path) ON DELETE CASCADE
);
"""

_CREATE_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_model_meta_full_path ON model_meta(full_path);",
    "CREATE INDEX IF NOT EXISTS idx_model_trained_words_full_path ON model_trained_words(full_path);",
]


def initialize_db() -> None:
    with get_connection() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute(_CREATE_MODEL_META)
        conn.execute(_CREATE_MODEL_TRAINED_WORDS)
        for idx in _CREATE_INDEXES:
            conn.execute(idx)


@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
