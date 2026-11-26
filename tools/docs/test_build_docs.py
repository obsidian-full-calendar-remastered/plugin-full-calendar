"""Unit tests for dual-channel MkDocs build helpers."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

from tools.docs.assets import cleanup_beta_seo_files
from tools.docs.git_ops import SEMVER_TAG_RE, resolve_build_mode
from tools.docs.yaml_utils import PermissiveSafeLoader, load_yaml


class TestYamlUtils(unittest.TestCase):
    def test_permissive_loader_does_not_mutate_global_safe_loader(self) -> None:
        sample = "foo: !!python/name:material.extensions.emoji.twemoji\n"
        with tempfile.TemporaryDirectory() as tmp:
            cfg = Path(tmp) / "mkdocs.yml"
            cfg.write_text(sample, encoding="utf-8")
            parsed = load_yaml(cfg)
            self.assertIn("foo", parsed)

        with self.assertRaises(yaml.constructor.ConstructorError):
            yaml.safe_load(sample)
        self.assertIsNot(PermissiveSafeLoader, yaml.SafeLoader)


class TestSemverTagAndModeResolution(unittest.TestCase):
    def test_semver_tag_regex(self) -> None:
        self.assertTrue(SEMVER_TAG_RE.match("0.13.7"))
        self.assertTrue(SEMVER_TAG_RE.match("1.0.0"))
        self.assertFalse(SEMVER_TAG_RE.match("0.13.7.6"))
        self.assertFalse(SEMVER_TAG_RE.match("v0.13.7"))
        self.assertFalse(SEMVER_TAG_RE.match("0.13.7-beta.1"))

    def test_resolve_build_mode_explicit_passthrough(self) -> None:
        self.assertEqual(
            resolve_build_mode("beta-only", Path("."), "origin/gh-pages", "0.13.7"),
            "beta-only",
        )

    def test_resolve_build_mode_auto_triggers_both_on_release_or_tag_or_force(self) -> None:
        self.assertEqual(
            resolve_build_mode("auto", Path("."), "origin/gh-pages", "0.13.7", event_name="release"),
            "both",
        )
        self.assertEqual(
            resolve_build_mode("auto", Path("."), "origin/gh-pages", "0.13.7", git_ref="refs/tags/0.13.8"),
            "both",
        )
        self.assertEqual(
            resolve_build_mode("auto", Path("."), "origin/gh-pages", "0.13.7", force_stable=True),
            "both",
        )

    def test_resolve_build_mode_auto_bootstraps_when_gh_pages_missing_or_stale(self) -> None:
        with patch("tools.docs.git_ops.git_ref_exists", return_value=False):
            self.assertEqual(resolve_build_mode("auto", Path("."), "origin/gh-pages", "0.13.7"), "both")

        with (
            patch("tools.docs.git_ops.git_ref_exists", return_value=True),
            patch("tools.docs.git_ops.gh_pages_has_path", return_value=False),
        ):
            self.assertEqual(resolve_build_mode("auto", Path("."), "origin/gh-pages", "0.13.7"), "both")

        with (
            patch("tools.docs.git_ops.git_ref_exists", return_value=True),
            patch("tools.docs.git_ops.gh_pages_has_path", return_value=True),
            patch("tools.docs.git_ops.read_gh_pages_text", return_value="0.13.6"),
        ):
            self.assertEqual(resolve_build_mode("auto", Path("."), "origin/gh-pages", "0.13.7"), "both")

    def test_resolve_build_mode_auto_selects_beta_only_when_up_to_date(self) -> None:
        with (
            patch("tools.docs.git_ops.git_ref_exists", return_value=True),
            patch("tools.docs.git_ops.gh_pages_has_path", return_value=True),
            patch("tools.docs.git_ops.read_gh_pages_text", return_value="0.13.7"),
        ):
            self.assertEqual(
                resolve_build_mode("auto", Path("."), "origin/gh-pages", "0.13.7", event_name="push"),
                "beta-only",
            )


class TestBetaSeoCleanup(unittest.TestCase):
    def test_cleanup_beta_seo_files_removes_only_crawler_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            beta_dir = Path(tmp)
            for name in ("sitemap.xml", "sitemap.xml.gz", "robots.txt", "index.html"):
                (beta_dir / name).write_text("x", encoding="utf-8")

            cleanup_beta_seo_files(beta_dir)

            self.assertFalse((beta_dir / "sitemap.xml").exists())
            self.assertFalse((beta_dir / "sitemap.xml.gz").exists())
            self.assertFalse((beta_dir / "robots.txt").exists())
            self.assertTrue((beta_dir / "index.html").exists())


if __name__ == "__main__":
    unittest.main()
