"""MkDocs channel configuration, cache sharing, and build execution."""

from __future__ import annotations

import shutil
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import yaml

from tools.docs.assets import cleanup_beta_seo_files, copy_agent_assets, copy_stable_runtime_assets
from tools.docs.git_ops import run_cmd, temporary_worktree
from tools.docs.yaml_utils import load_yaml


def apply_switcher_overlay_if_needed(repo_root: Path, src_dir: Path) -> bool:
    """
    If building an older tag that predates the version switcher, copy the
    switcher partial, header override, CSS, and JS from `main` into the
    disposable worktree so Stable gets the toggle immediately.
    """
    marker = src_dir / "docs" / "overrides" / "partials" / "version-switcher.html"
    if marker.exists():
        return False

    overlay_files = [
        "docs/overrides/partials/header.html",
        "docs/overrides/partials/version-switcher.html",
        "docs/assets/stylesheets/version-switcher.css",
        "docs/assets/javascripts/version-switcher.js",
    ]
    for rel in overlay_files:
        src_file = repo_root / rel
        if not src_file.exists():
            raise FileNotFoundError(f"Expected switcher overlay file not found: {src_file}")
        dest_file = src_dir / rel
        dest_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_file, dest_file)

    print(f"Applied version-switcher overlay onto worktree {src_dir}.")
    return True


def write_build_mkdocs_config(
    src_dir: Path,
    channel: str,
    docs_version: str,
    stable_version: str,
    beta_version: str,
    include_switcher_assets: bool,
) -> Path:
    base_cfg = load_yaml(src_dir / "mkdocs.yml")

    base_site_url = str(
        base_cfg.get("site_url", "https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/")
    )
    if not base_site_url.endswith("/"):
        base_site_url += "/"
    target_site_url = f"{base_site_url}beta/" if channel == "beta" else base_site_url

    merged_extra = dict(base_cfg.get("extra") or {})
    merged_extra.update(
        {
            "docs_channel": channel,
            "docs_version": docs_version,
            "stable_version": stable_version,
            "beta_version": beta_version,
        }
    )

    override_cfg: dict = {
        "INHERIT": "mkdocs.yml",
        "site_url": target_site_url,
        "extra": merged_extra,
    }

    if include_switcher_assets:
        extra_css = list(base_cfg.get("extra_css") or [])
        if "assets/stylesheets/version-switcher.css" not in extra_css:
            extra_css.append("assets/stylesheets/version-switcher.css")
        override_cfg["extra_css"] = extra_css

        extra_js = list(base_cfg.get("extra_javascript") or [])
        if "assets/javascripts/version-switcher.js" not in extra_js:
            extra_js.append("assets/javascripts/version-switcher.js")
        override_cfg["extra_javascript"] = extra_js

    tmp_cfg_path = src_dir / ".mkdocs.build.yml"
    tmp_cfg_path.write_text(yaml.safe_dump(override_cfg, sort_keys=False), encoding="utf-8")
    return tmp_cfg_path


@contextmanager
def sync_git_committers_cache(repo_root: Path, src_dir: Path) -> Iterator[None]:
    """Share `.cache/plugin/git-committers` with temporary worktrees."""
    if repo_root.resolve() == src_dir.resolve():
        yield
        return

    repo_cache = repo_root / ".cache" / "plugin" / "git-committers"
    work_cache = src_dir / ".cache" / "plugin" / "git-committers"

    if repo_cache.exists():
        work_cache.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(repo_cache, work_cache, dirs_exist_ok=True)

    try:
        yield
    finally:
        if work_cache.exists():
            repo_cache.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(work_cache, repo_cache, dirs_exist_ok=True)


def build_channel(
    repo_root: Path,
    src_dir: Path,
    out_dir: Path,
    channel: str,
    docs_version: str,
    stable_version: str,
    beta_version: str,
    stable_tag: str,
) -> None:
    overlay_applied = False
    if channel == "stable":
        overlay_applied = apply_switcher_overlay_if_needed(repo_root, src_dir)

    tmp_cfg = write_build_mkdocs_config(
        src_dir=src_dir,
        channel=channel,
        docs_version=docs_version,
        stable_version=stable_version,
        beta_version=beta_version,
        include_switcher_assets=overlay_applied,
    )
    try:
        abs_out = out_dir.resolve()
        abs_out.mkdir(parents=True, exist_ok=True)
        print(f"Building {channel} docs (version {docs_version}) -> {abs_out}")
        with sync_git_committers_cache(repo_root, src_dir):
            run_cmd(
                [sys.executable, "-m", "mkdocs", "build", "-f", tmp_cfg.name, "-d", str(abs_out)],
                cwd=src_dir,
            )
    finally:
        if tmp_cfg.exists():
            tmp_cfg.unlink()

    if channel == "stable":
        copy_stable_runtime_assets(src_dir, out_dir, stable_tag)
    else:
        copy_agent_assets(src_dir, out_dir)
        cleanup_beta_seo_files(out_dir)


def build_stable_from_tag(
    repo_root: Path,
    out_dir: Path,
    stable_tag: str,
    stable_version: str,
    beta_version: str,
) -> None:
    with temporary_worktree(repo_root, stable_tag) as worktree_dir:
        build_channel(
            repo_root=repo_root,
            src_dir=worktree_dir,
            out_dir=out_dir,
            channel="stable",
            docs_version=stable_version,
            stable_version=stable_version,
            beta_version=beta_version,
            stable_tag=stable_tag,
        )
