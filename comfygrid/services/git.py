import logging
import subprocess
from datetime import datetime

logger = logging.getLogger(__name__)


def run_git_command(*args):
    return subprocess.run(
        ["git", *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        check=True
    ).stdout.strip()


def install_from_git(repo_url, dest_dir, branch=None, version=None):
    try:
        cmd = ["git", "clone"]
        if branch:
            cmd += ["-b", branch]
        cmd += [repo_url, dest_dir]
        subprocess.run(cmd, check=True)

        if version and version.upper() != "HEAD":
            subprocess.run(
                ["git", "-C", dest_dir, "checkout", version],
                check=True
            )
        return True
    except subprocess.CalledProcessError as e:
        logging.error(f"Failed to clone git repository from {repo_url} to {dest_dir}: {e}")
        return False


def update_git_repository(repo_dir):
    try:
        subprocess.run(
            ["git", "-C", repo_dir, "pull", "--ff-only"],
            check=True
        )
        return True
    except subprocess.CalledProcessError as e:
        logging.error(f"Failed to update git repository at {repo_dir}: {e}")
        return False


def get_version_info():
    info = {}
    try:
        info["branch"] = run_git_command("rev-parse", "--abbrev-ref", "HEAD")
        info["commit"] = run_git_command("rev-parse", "--short", "HEAD")
        try:
            info["tag"] = run_git_command("describe", "--tags", "--abbrev=0")
        except subprocess.CalledProcessError:
            info["tag"] = None

        info["comitter"] = run_git_command("show", "-s", "--format=%an", "HEAD")

        date_str = run_git_command("show", "-s", "--format=%cI", "HEAD")
        dt = datetime.fromisoformat(date_str)
        info["date"] = dt.astimezone().strftime('%Y-%m-%d %H:%M:%S')

        return info
    except subprocess.CalledProcessError:
        return {}
