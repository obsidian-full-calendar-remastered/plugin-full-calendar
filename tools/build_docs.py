#!/usr/bin/env python3
"""
Dual-channel MkDocs build orchestrator for Full Calendar Remastered.

Produces a combined static site tree:
  - Root (`/`): Stable documentation + runtime/SEO/meta assets built strictly
    from the latest production semver git tag (e.g. `0.13.7`).
  - `/beta/`: Beta documentation built from the current working tree (`main`),
    marked `noindex, nofollow` with an announcement banner.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from tools.docs.assets import write_version_info
from tools.docs.git_ops import (
    detect_latest_stable_tag,
    extract_gh_pages_snapshot,
    get_beta_version,
    get_stable_version,
    resolve_build_mode,
)
from tools.docs.mkdocs_builder import build_channel, build_stable_from_tag


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Stable + Beta MkDocs documentation.")
    parser.add_argument(
        "--mode",
        choices=["auto", "both", "beta-only", "stable-only"],
        default="auto",
        help="Build mode: auto-detect from git/gh-pages, both, beta-only, or stable-only.",
    )
    parser.add_argument("--output-dir", default="site", help="Output directory (default: site).")
    parser.add_argument("--stable-tag", default=None, help="Explicit production tag (default: auto-detect).")
    parser.add_argument(
        "--gh-pages-ref",
        default="origin/gh-pages",
        help="Git ref for existing gh-pages snapshot used in auto/beta-only mode.",
    )
    parser.add_argument("--event-name", default="", help="GitHub event name (used in auto mode).")
    parser.add_argument("--git-ref", default="", help="GitHub ref (used in auto mode).")
    parser.add_argument(
        "--force-stable",
        default="false",
        help="Set to 'true' to force rebuilding Stable in auto mode.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path.cwd().resolve()
    out_dir = Path(args.output_dir).resolve()

    stable_tag = args.stable_tag or detect_latest_stable_tag(repo_root)
    stable_version = get_stable_version(repo_root, stable_tag)
    beta_version = get_beta_version(repo_root)

    mode = resolve_build_mode(
        requested_mode=args.mode,
        repo_root=repo_root,
        gh_pages_ref=args.gh_pages_ref,
        latest_tag=stable_tag,
        event_name=args.event_name,
        git_ref=args.git_ref,
        force_stable=str(args.force_stable).strip().lower() == "true",
    )
    print(f"Resolved versions -> stableTag={stable_tag}, stable={stable_version}, beta={beta_version}, mode={mode}")

    if mode in ("both", "stable-only"):
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        build_stable_from_tag(
            repo_root=repo_root,
            out_dir=out_dir,
            stable_tag=stable_tag,
            stable_version=stable_version,
            beta_version=beta_version,
        )

    if mode == "beta-only":
        if out_dir.exists():
            shutil.rmtree(out_dir)
        extract_gh_pages_snapshot(repo_root, args.gh_pages_ref, out_dir)
        beta_dir = out_dir / "beta"
        if beta_dir.exists():
            shutil.rmtree(beta_dir)

    if mode in ("both", "beta-only"):
        build_channel(
            repo_root=repo_root,
            src_dir=repo_root,
            out_dir=out_dir / "beta",
            channel="beta",
            docs_version=beta_version,
            stable_version=stable_version,
            beta_version=beta_version,
            stable_tag=stable_tag,
        )

    write_version_info(out_dir, stable_version, beta_version, stable_tag)
    print("Documentation build completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
