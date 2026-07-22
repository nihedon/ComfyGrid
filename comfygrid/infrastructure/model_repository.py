from __future__ import annotations

import threading
from dataclasses import dataclass
from types import EllipsisType

from comfygrid.infrastructure.database import get_connection

_write_lock = threading.Lock()


@dataclass
class ModelMeta:
    full_path: str
    url: str | None
    nsfw: bool
    rate: int | None
    favorite: bool
    trained_words: list[str]


def get_model_meta(full_path: str) -> ModelMeta | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT url, nsfw, rate, favorite FROM model_meta WHERE full_path = ?",
            (full_path,),
        ).fetchone()
        if row is None:
            return None
        words = [
            r["word"]
            for r in conn.execute(
                "SELECT word FROM model_trained_words WHERE full_path = ? ORDER BY sort_order",
                (full_path,),
            ).fetchall()
        ]
        return ModelMeta(
            full_path=full_path,
            url=row["url"],
            nsfw=bool(row["nsfw"]),
            rate=row["rate"],
            favorite=bool(row["favorite"]),
            trained_words=words,
        )


def get_all_model_metas() -> dict[str, ModelMeta]:
    with get_connection() as conn:
        rows = conn.execute("SELECT full_path, url, nsfw, rate, favorite FROM model_meta").fetchall()
        word_rows = conn.execute("SELECT full_path, word FROM model_trained_words ORDER BY sort_order").fetchall()

        words_by_path = {}
        for r in word_rows:
            words_by_path.setdefault(r["full_path"], []).append(r["word"])

        metas = {}
        for row in rows:
            path = row["full_path"]
            metas[path] = ModelMeta(
                full_path=path,
                url=row["url"],
                nsfw=bool(row["nsfw"]),
                rate=row["rate"],
                favorite=bool(row["favorite"]),
                trained_words=words_by_path.get(path, []),
            )
        return metas


def upsert_model_meta(
    full_path: str,
    *,
    url: str | None | EllipsisType = ...,
    nsfw: bool | None = None,
    rate: int | None | EllipsisType = ...,
    favorite: bool | None = None,
    trained_words: list[str] | None = None,
) -> None:
    with _write_lock:
        with get_connection() as conn:
            conn.execute("PRAGMA foreign_keys=ON;")
            existing = conn.execute(
                "SELECT id FROM model_meta WHERE full_path = ?", (full_path,)
            ).fetchone()

            if existing is None:
                conn.execute(
                    """
                    INSERT INTO model_meta (full_path, url, nsfw, rate, favorite)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        full_path,
                        None if url is ... else url,
                        int(nsfw) if nsfw is not None else 0,
                        None if rate is ... else rate,
                        int(favorite) if favorite is not None else 0,
                    ),
                )
            else:
                fields: list[str] = ["updated_at = datetime('now')"]
                params: list = []
                if url is not ...:
                    fields.append("url = ?")
                    params.append(url)
                if nsfw is not None:
                    fields.append("nsfw = ?")
                    params.append(int(nsfw))
                if rate is not ...:
                    fields.append("rate = ?")
                    params.append(rate)
                if favorite is not None:
                    fields.append("favorite = ?")
                    params.append(int(favorite))
                params.append(full_path)
                conn.execute(
                    f"UPDATE model_meta SET {', '.join(fields)} WHERE full_path = ?",
                    params,
                )

            if trained_words is not None:
                conn.execute(
                    "DELETE FROM model_trained_words WHERE full_path = ?", (full_path,)
                )
                conn.executemany(
                    "INSERT INTO model_trained_words (full_path, word, sort_order) VALUES (?, ?, ?)",
                    [(full_path, word, i) for i, word in enumerate(trained_words)],
                )


def bulk_upsert_model_metas(models: list[dict]) -> None:
    if not models:
        return

    with _write_lock:
        with get_connection() as conn:
            conn.execute("PRAGMA foreign_keys=ON;")

            meta_data = []
            words_data = []
            paths_data = []

            for m in models:
                full_path = m["full_path"]
                url = m.get("url")
                nsfw = int(m.get("nsfw", False))
                rate = None
                favorite = 0

                meta_data.append((full_path, url, nsfw, rate, favorite))
                paths_data.append((full_path,))

                trained_words = m.get("trainedWords", [])
                for i, word in enumerate(trained_words):
                    words_data.append((full_path, word, i))

            conn.executemany(
                """
                INSERT OR REPLACE INTO model_meta (full_path, url, nsfw, rate, favorite)
                VALUES (?, ?, ?, ?, ?)
                """,
                meta_data
            )

            conn.executemany("DELETE FROM model_trained_words WHERE full_path = ?", paths_data)

            if words_data:
                conn.executemany(
                    "INSERT INTO model_trained_words (full_path, word, sort_order) VALUES (?, ?, ?)",
                    words_data
                )
