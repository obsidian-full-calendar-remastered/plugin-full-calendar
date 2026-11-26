"""Git plumbing, version resolution, mode planning, and worktree management."""

from __future__ import annotations

import io
import json
import re
import shutil
import subprocess
import tarfile
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SEMVER_TAG_RE = re.compile(r"^\d+\.\d+\.\d+$")


def run_cmd(
    cmd: list[str],
    cwd: Path | None = None,
    capture: bool = False,
    check: bool = True,
) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        check=check,
        text=True,
        capture_output=capture,
    )


def detect_latest_stable_tag(repo_root: Path) -> str:
    """Return the newest production semver tag (X.Y.Z) in the repository."""
    res = run_cmd(["git", "tag", "--sort=-v:refname"], cwd=repo_root, capture=True)
    for line in res.stdout.splitlines():
        tag = line.strip()
        if SEMVER_TAG_RE.match(tag):
            return tag
    raise RuntimeError("No production semver tag (X.Y.Z) found in git repository.")


def read_json_from_git(repo_root: Path, rev: str, rel_path: str) -> dict | None:
    try:
        res = run_cmd(["git", "show", f"{rev}:{rel_path}"], cwd=repo_root, capture=True)
        return json.loads(res.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None


def read_json_file(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def get_stable_version(repo_root: Path, stable_tag: str) -> str:
    manifest = read_json_from_git(repo_root, stable_tag, "manifest.json")
    if manifest and isinstance(manifest.get("version"), str):
        return manifest["version"]
    return stable_tag


def get_beta_version(repo_root: Path) -> str:
    beta_manifest = read_json_file(repo_root / "manifest-beta.json")
    if beta_manifest and isinstance(beta_manifest.get("version"), str):
        return beta_manifest["version"]
    manifest = read_json_file(repo_root / "manifest.json")
    if manifest and isinstance(manifest.get("version"), str):
        return manifest["version"]
    return "beta"


def git_ref_exists(repo_root: Path, ref: str) -> bool:
    res = run_cmd(["git", "rev-parse", "--verify", ref], cwd=repo_root, capture=True, check=False)
    return res.returncode == 0


def gh_pages_has_path(repo_root: Path, gh_pages_ref: str, rel_path: str) -> bool:
    res = run_cmd(
        ["git", "cat-file", "-e", f"{gh_pages_ref}:{rel_path}"],
        cwd=repo_root,
        capture=True,
        check=False,
    )
    return res.returncode == 0


def read_gh_pages_text(repo_root: Path, gh_pages_ref: str, rel_path: str) -> str:
    res = run_cmd(
        ["git", "show", f"{gh_pages_ref}:{rel_path}"],
        cwd=repo_root,
        capture=True,
        check=False,
    )
    return res.stdout.strip() if res.returncode == 0 else ""


def resolve_build_mode(
    requested_mode: str,
    repo_root: Path,
    gh_pages_ref: str,
    latest_tag: str,
    event_name: str = "",
    git_ref: str = "",
    force_stable: bool = False,
) -> str:
    """Resolve `auto` mode into `both` or `beta-only` using a single Python source of truth."""
    if requested_mode != "auto":
        return requested_mode

    if force_stable or event_name == "release" or git_ref.startswith("refs/tags/"):
        return "both"

    if not git_ref_exists(repo_root, gh_pages_ref):
        print(f"{gh_pages_ref} does not exist yet; selecting mode=both.")
        return "both"

    if not gh_pages_has_path(repo_root, gh_pages_ref, "beta/index.html"):
        print(f"{gh_pages_ref} is missing beta/index.html; selecting mode=both.")
        return "both"

    deployed_tag = read_gh_pages_text(repo_root, gh_pages_ref, ".docs-stable-tag")
    if not deployed_tag or deployed_tag != latest_tag:
        print(f"Stable tag mismatch ({deployed_tag!r} != {latest_tag!r}); selecting mode=both.")
        return "both"

    return "beta-only"


def extract_gh_pages_snapshot(repo_root: Path, gh_pages_ref: str, out_dir: Path) -> None:
    """Extract an existing gh-pages git ref safely into out_dir."""
    print(f"Extracting existing Stable snapshot from {gh_pages_ref} -> {out_dir}")
    res = subprocess.run(
        ["git", "archive", "--format=tar", gh_pages_ref],
        cwd=str(repo_root),
        check=True,
        capture_output=True,
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(res.stdout), mode="r:*") as tf:
        if hasattr(tarfile, "data_filter"):
            tf.extractall(path=out_dir, filter="data")
        else:
            tf.extractall(path=out_dir)


@contextmanager
def temporary_worktree(repo_root: Path, ref: str) -> Iterator[Path]:
    """Create a detached git worktree for `ref` and guarantee cleanup on exit."""
    tmp_parent = Path(tempfile.mkdtemp(prefix="fcr-stable-docs-"))
    worktree_dir = tmp_parent / "src"
    try:
        print(f"Creating temporary git worktree for tag {ref}...")
        run_cmd(["git", "worktree", "add", "--detach", str(worktree_dir), ref], cwd=repo_root)
        yield worktree_dir
    finally:
        run_cmd(["git", "worktree", "remove", "--force", str(worktree_dir)], cwd=repo_root, check=False)
        shutil.rmtree(tmp_parent, ignore_errors=True)
