"""Runtime, agent, and SEO asset management for Stable and Beta doc builds."""

from __future__ import annotations

import glob
import json
import shutil
from pathlib import Path

from tools.docs.git_ops import run_cmd
from tools.generate_seo_assets import generate_seo_assets


def copy_glob(pattern: str, dest_dir: Path) -> int:
    matches = glob.glob(pattern)
    if not matches:
        return 0
    dest_dir.mkdir(parents=True, exist_ok=True)
    for item in matches:
        shutil.copy2(item, dest_dir / Path(item).name)
    return len(matches)


def copy_agent_assets(src_dir: Path, out_dir: Path) -> None:
    generator = src_dir / "tools" / "generate-plugin-docs-index.mjs"
    if not generator.exists():
        return
    agent_out = out_dir / "assets" / "agent"
    agent_out.mkdir(parents=True, exist_ok=True)
    run_cmd(
        ["node", str(generator), "--out", str(agent_out / "plugin-docs-index.md")],
        cwd=src_dir,
    )
    agent_spec = src_dir / "docs" / "architecture" / "api" / "agent-spec.md"
    if agent_spec.exists():
        shutil.copy2(agent_spec, agent_out / "agent-spec.md")


def copy_stable_runtime_assets(src_dir: Path, out_dir: Path, stable_tag: str) -> None:
    copy_agent_assets(src_dir, out_dir)

    generate_seo_assets(
        config_path=src_dir / "mkdocs.yml",
        docs_dir=src_dir / "docs",
        site_dir=out_dir,
    )

    copy_glob(str(src_dir / "src" / "features" / "i18n" / "locales" / "*.json"), out_dir / "assets" / "i18n")
    copy_glob(str(src_dir / "src" / "features" / "nlp" / "payloads" / "*.json"), out_dir / "assets" / "nlp")

    for rel in (
        "docs/assets/meta/google-auth-callback.html",
        "docs/assets/meta/googlef764ec34bcd1fe4a.html",
        "docs/assets/meta/changelogs.json",
    ):
        src_file = src_dir / rel
        if src_file.exists():
            shutil.copy2(src_file, out_dir / src_file.name)

    (out_dir / ".docs-stable-tag").write_text(f"{stable_tag}\n", encoding="utf-8")


def cleanup_beta_seo_files(out_dir: Path) -> None:
    """Remove crawler-facing sitemap and robots files from the noindex Beta subdirectory."""
    for name in ("sitemap.xml", "sitemap.xml.gz", "robots.txt"):
        target = out_dir / name
        if target.exists():
            target.unlink()


def write_version_info(out_dir: Path, stable_version: str, beta_version: str, stable_tag: str) -> None:
    payload = {
        "stable": stable_version,
        "beta": beta_version,
        "stableTag": stable_tag,
    }
    (out_dir / "version-info.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
