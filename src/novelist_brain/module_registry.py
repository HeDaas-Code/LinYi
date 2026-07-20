"""Dynamic module registry and plugin discovery for the novelist brain.

This module implements Design.md §10 (扩展性设计) by allowing modules to be
registered declaratively, discovered from Python files, and instantiated in
topological dependency order.
"""

from __future__ import annotations

import importlib.util
import inspect
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, TypeVar

from src.novelist_brain.module import Module


ModuleType = TypeVar("ModuleType", bound=Module)


@dataclass
class ModuleDescriptor:
    """A registered module class plus its metadata and factory options."""

    cls: type[Module]
    name: str
    version: str
    description: str
    dependencies: list[str] = field(default_factory=list)
    category: str = ""
    factory_options: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_class(
        cls,
        module_cls: type[ModuleType],
        factory_options: dict[str, Any] | None = None,
    ) -> "ModuleDescriptor":
        meta = module_cls.metadata()
        return cls(
            cls=module_cls,
            name=meta.get("name", module_cls.__name__),
            version=meta.get("version", "0.1.0"),
            description=meta.get("description", ""),
            dependencies=list(meta.get("dependencies", [])),
            category=meta.get("category", ""),
            factory_options=dict(factory_options or {}),
        )


class ModuleRegistry:
    """Registry that discovers, orders, and instantiates brain modules.

    Modules can be registered explicitly with :meth:`register` or discovered
    from a directory with :meth:`discover`.  The registry resolves declared
    dependencies and instantiates modules in topological order.
    """

    def __init__(self) -> None:
        self._descriptors: dict[str, ModuleDescriptor] = {}

    def register(
        self,
        module_cls: type[ModuleType],
        factory_options: dict[str, Any] | None = None,
    ) -> ModuleDescriptor:
        """Register a module class explicitly."""
        descriptor = ModuleDescriptor.from_class(module_cls, factory_options)
        self._descriptors[descriptor.name] = descriptor
        return descriptor

    def discover(self, directory: str | os.PathLike[str]) -> list[ModuleDescriptor]:
        """Discover and register concrete :class:`Module` subclasses from ``directory``.

        Any ``*.py`` file (except ``__init__.py``) is loaded as a module and
        scanned for subclasses of :class:`Module`.
        """
        added: list[ModuleDescriptor] = []
        path = Path(directory)
        if not path.is_dir():
            return added

        for file_path in sorted(path.glob("*.py")):
            if file_path.name == "__init__.py":
                continue
            descriptors = self._load_module_file(file_path)
            added.extend(descriptors)
        return added

    def _load_module_file(self, file_path: Path) -> list[ModuleDescriptor]:
        added: list[ModuleDescriptor] = []
        spec = importlib.util.spec_from_file_location(
            file_path.stem, str(file_path)
        )
        if spec is None or spec.loader is None:
            return added
        py_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(py_module)

        for _name, obj in inspect.getmembers(py_module):
            if (
                inspect.isclass(obj)
                and issubclass(obj, Module)
                and obj is not Module
                and obj.__module__ == py_module.__name__
            ):
                added.append(self.register(obj))
        return added

    def unregister(self, name: str) -> bool:
        """Remove a registered module by canonical name."""
        return self._descriptors.pop(name, None) is not None

    def descriptor(self, name: str) -> ModuleDescriptor | None:
        """Return the descriptor for ``name`` if registered."""
        return self._descriptors.get(name)

    def list_modules(
        self, category: str | None = None
    ) -> list[ModuleDescriptor]:
        """Return all registered descriptors, optionally filtered by category."""
        descriptors = list(self._descriptors.values())
        if category is not None:
            descriptors = [d for d in descriptors if d.category == category]
        return sorted(descriptors, key=lambda d: d.name)

    def instantiate(
        self,
        overrides: dict[str, dict[str, Any]] | None = None,
        filter_fn: Callable[[ModuleDescriptor], bool] | None = None,
    ) -> list[Module]:
        """Instantiate all registered modules in dependency order.

        ``overrides`` maps canonical module names to constructor keyword
        arguments. ``filter_fn`` can exclude descriptors before instantiation.
        """
        overrides = overrides or {}
        descriptors = list(self._descriptors.values())
        if filter_fn is not None:
            descriptors = [d for d in descriptors if filter_fn(d)]

        ordered = self._topological_sort(descriptors)
        instances: list[Module] = []
        for descriptor in ordered:
            kwargs = {"name": descriptor.name}
            kwargs.update(descriptor.factory_options)
            kwargs.update(overrides.get(descriptor.name, {}))
            instance = descriptor.cls(**kwargs)
            instances.append(instance)
        return instances

    def _topological_sort(
        self, descriptors: list[ModuleDescriptor]
    ) -> list[ModuleDescriptor]:
        """Order descriptors so dependencies appear before dependents."""
        by_name = {d.name: d for d in descriptors}
        visited: set[str] = set()
        result: list[ModuleDescriptor] = []

        def visit(d: ModuleDescriptor) -> None:
            if d.name in visited:
                return
            visited.add(d.name)
            for dep in d.dependencies:
                dep_desc = by_name.get(dep)
                if dep_desc is not None:
                    visit(dep_desc)
            result.append(d)

        for descriptor in descriptors:
            visit(descriptor)
        return result

    def to_dict(self) -> dict[str, Any]:
        """Return a serializable summary of the registry."""
        return {
            "modules": [
                {
                    "name": d.name,
                    "version": d.version,
                    "description": d.description,
                    "dependencies": d.dependencies,
                    "category": d.category,
                    "class": f"{d.cls.__module__}.{d.cls.__name__}",
                }
                for d in self.list_modules()
            ]
        }
