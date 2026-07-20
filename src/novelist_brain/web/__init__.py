"""Web dashboard package for the novelist brain agent."""

from src.novelist_brain.web.app import create_app
from src.novelist_brain.web.state_provider import AgentStateProvider, get_provider

__all__ = ["create_app", "AgentStateProvider", "get_provider"]