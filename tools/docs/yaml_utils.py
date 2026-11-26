"""YAML loading helpers that preserve MkDocs Python tags without mutating global SafeLoader."""

from __future__ import annotations

from pathlib import Path

import yaml


class PermissiveSafeLoader(yaml.SafeLoader):
    """SafeLoader subclass that tolerates MkDocs-specific YAML tags (e.g. !!python/name:)."""


def _unknown_tag_constructor(loader: yaml.SafeLoader, tag_suffix: str, node: yaml.Node):
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node)
    return loader.construct_scalar(node)


PermissiveSafeLoader.add_multi_constructor("", _unknown_tag_constructor)


def load_yaml(path: Path) -> dict:
    """Load a YAML mapping file using PermissiveSafeLoader."""
    data = yaml.load(path.read_text(encoding="utf-8"), Loader=PermissiveSafeLoader)
    return data if isinstance(data, dict) else {}
