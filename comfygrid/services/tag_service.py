import gzip
import json
import logging
import subprocess
from pathlib import Path
from typing import Any

import polars as pl

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TAGS_REPO_URL = "https://github.com/nihedon/prompt-tags.git"
TAGS_DIR = PROJECT_ROOT / "data" / "tags"
FRONTEND_PUBLIC_DIR = PROJECT_ROOT / "frontend" / "public"
FRONTEND_DIST_DIR = PROJECT_ROOT / "frontend" / "dist"

TAG_SOURCES = ["danbooru.donmai.us", "e621.net"]


def ensure_tags_cloned() -> bool:
    danbooru_csv = TAGS_DIR / "danbooru.donmai.us" / "tags.csv"
    e621_csv = TAGS_DIR / "e621.net" / "tags.csv"

    if danbooru_csv.is_file() and e621_csv.is_file():
        return True

    logging.info("Tags repository not found or incomplete. Cloning from %s...", TAGS_REPO_URL)
    TAGS_DIR.parent.mkdir(parents=True, exist_ok=True)

    if TAGS_DIR.exists() and not any(TAGS_DIR.iterdir()):
        TAGS_DIR.rmdir()

    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", TAGS_REPO_URL, str(TAGS_DIR)],
            check=True,
            capture_output=True,
            text=True,
        )
        logging.info("Successfully cloned tags repository to %s", TAGS_DIR)
        return True
    except Exception as e:
        logging.exception("Failed to clone tags repository: %s", e)
        return False


MIN_POST_COUNT = 10


def update_tags_repository() -> bool:
    if not ensure_tags_cloned():
        return False
    try:
        subprocess.run(
            ["git", "-C", str(TAGS_DIR), "pull", "--ff-only"],
            check=True,
            capture_output=True,
            text=True,
        )
        logging.info("Successfully pulled latest tags repository")
        return True
    except Exception as e:
        logging.exception("Failed to pull tags repository: %s", e)
        return False


def build_tag_models_for_source(tag_source: str, min_post_count: int = MIN_POST_COUNT) -> dict[str, Any]:
    source_dir = TAGS_DIR / tag_source
    tags_csv_path = source_dir / "tags.csv"
    aliases_csv_path = source_dir / "tag_aliases.csv"

    tag_models: dict[str, list[Any]] = {}

    if tags_csv_path.is_file():
        df_tags = pl.read_csv(str(tags_csv_path), columns=["name", "category", "post_count"])
        df_tags = df_tags.filter(pl.col("post_count") >= min_post_count)
        for row in df_tags.rows():
            tag_name = str(row[0]).replace("_", " ")
            category = int(row[1])
            post_count = int(row[2])
            tag_models[tag_name] = [post_count, category]

    if aliases_csv_path.is_file():
        df_aliases = pl.read_csv(str(aliases_csv_path), columns=["antecedent_name", "consequent_name"])
        for row in df_aliases.rows():
            antecedent_name = str(row[0]).replace("_", " ")
            consequent_name = str(row[1]).replace("_", " ")
            if consequent_name in tag_models:
                target_entry = tag_models[consequent_name]
                if len(target_entry) == 2:
                    target_entry.append([antecedent_name])
                else:
                    target_entry[2].append(antecedent_name)

    return {
        "version": 2,
        "tagModels": tag_models,
        "loraModels": {},
    }


def export_tag_models_archive(data: dict[str, Any], destination_file: Path) -> None:
    destination_file.parent.mkdir(parents=True, exist_ok=True)
    temp_file = destination_file.with_suffix(destination_file.suffix + ".tmp")
    with gzip.open(temp_file, "wt", encoding="utf-8", compresslevel=9) as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    temp_file.replace(destination_file)


def is_archive_outdated(archive_file: Path, source_csv: Path) -> bool:
    if not archive_file.is_file():
        return True
    if not source_csv.is_file():
        return False
    return archive_file.stat().st_mtime < source_csv.stat().st_mtime


def ensure_tag_models_generated(output_dirs: list[Path] | None = None, force_rebuild: bool = False) -> list[Path]:
    if not ensure_tags_cloned():
        return []

    if output_dirs:
        target_dirs = output_dirs
    elif FRONTEND_PUBLIC_DIR.is_dir():
        target_dirs = [FRONTEND_PUBLIC_DIR]
    elif FRONTEND_DIST_DIR.is_dir():
        target_dirs = [FRONTEND_DIST_DIR]
    else:
        target_dirs = [FRONTEND_PUBLIC_DIR]

    generated_files: list[Path] = []

    for tag_source in TAG_SOURCES:
        source_csv = TAGS_DIR / tag_source / "tags.csv"
        file_name = f"{tag_source}.json.gz"

        for target_dir in target_dirs:
            archive_path = target_dir / file_name
            if force_rebuild or is_archive_outdated(archive_path, source_csv):
                logging.info("Generating %s from %s...", file_name, tag_source)
                data = build_tag_models_for_source(tag_source)
                export_tag_models_archive(data, archive_path)
                generated_files.append(archive_path)

    return generated_files


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Manage prompt tag dictionaries")
    parser.add_argument("--pull", action="store_true", help="Pull latest tags from remote repository")
    parser.add_argument("--force", action="store_true", help="Force rebuild dictionaries from CSVs")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    if args.pull:
        update_tags_repository()

    ensure_tag_models_generated(force_rebuild=args.force)

