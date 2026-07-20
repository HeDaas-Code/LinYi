"""Tests for the dynamic module registry and plugin discovery."""

from __future__ import annotations

import tempfile
from pathlib import Path

from src.novelist_brain.module import Module
from src.novelist_brain.module_registry import ModuleRegistry


class AlphaModule(Module):
    @classmethod
    def metadata(cls) -> dict[str, object]:
        return {
            "name": "alpha",
            "version": "1.0.0",
            "description": "First module",
            "dependencies": [],
            "category": "test",
        }

    def init(self, context: dict[str, object]) -> None:
        pass

    def on_bus_message(self, message: object) -> None:
        pass

    def tick(self, delta: object) -> None:
        pass


class BetaModule(Module):
    @classmethod
    def metadata(cls) -> dict[str, object]:
        return {
            "name": "beta",
            "version": "1.0.0",
            "description": "Depends on alpha",
            "dependencies": ["alpha"],
            "category": "test",
        }

    def init(self, context: dict[str, object]) -> None:
        pass

    def on_bus_message(self, message: object) -> None:
        pass

    def tick(self, delta: object) -> None:
        pass


def test_registry_preserves_registration_order() -> None:
    registry = ModuleRegistry()
    registry.register(AlphaModule)
    registry.register(BetaModule)

    instances = registry.instantiate()
    assert len(instances) == 2
    assert instances[0].name == "alpha"
    assert instances[1].name == "beta"


def test_registry_topological_sort_dependencies() -> None:
    registry = ModuleRegistry()
    # Register in reverse order; dependencies should still resolve.
    registry.register(BetaModule)
    registry.register(AlphaModule)

    instances = registry.instantiate()
    names = [m.name for m in instances]
    assert names.index("alpha") < names.index("beta")


def test_registry_factory_overrides() -> None:
    registry = ModuleRegistry()
    registry.register(AlphaModule, factory_options={"name": "custom_alpha"})

    instances = registry.instantiate()
    assert len(instances) == 1
    assert instances[0].name == "custom_alpha"


def test_registry_discover_from_directory() -> None:
    plugin_code = '''
from src.novelist_brain.module import Module

class GammaModule(Module):
    @classmethod
    def metadata(cls):
        return {
            "name": "gamma",
            "version": "0.1.0",
            "dependencies": [],
            "category": "plugin",
        }

    def init(self, context):
        pass

    def on_bus_message(self, message):
        pass

    def tick(self, delta):
        pass
'''
    with tempfile.TemporaryDirectory() as tmpdir:
        plugin_file = Path(tmpdir) / "gamma_plugin.py"
        plugin_file.write_text(plugin_code, encoding="utf-8")

        registry = ModuleRegistry()
        discovered = registry.discover(tmpdir)
        assert len(discovered) == 1
        assert discovered[0].name == "gamma"

        instances = registry.instantiate()
        assert len(instances) == 1
        assert instances[0].name == "gamma"


def test_registry_to_dict_summary() -> None:
    registry = ModuleRegistry()
    registry.register(AlphaModule)
    summary = registry.to_dict()
    assert "modules" in summary
    assert summary["modules"][0]["name"] == "alpha"
    assert summary["modules"][0]["category"] == "test"


if __name__ == "__main__":
    test_registry_preserves_registration_order()
    test_registry_topological_sort_dependencies()
    test_registry_factory_overrides()
    test_registry_discover_from_directory()
    test_registry_to_dict_summary()
    print("module registry tests passed")
