from __future__ import annotations

from dataclasses import dataclass

from comfygrid.infrastructure.database import get_connection


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


def upsert_model_meta(
    full_path: str,
    *,
    url: str | None = None,
    nsfw: bool | None = None,
    rate: int | None = ...,
    favorite: bool | None = None,
    trained_words: list[str] | None = None,
) -> None:
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
