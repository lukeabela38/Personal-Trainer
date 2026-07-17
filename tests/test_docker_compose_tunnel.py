from __future__ import annotations

from pathlib import Path
from unittest import TestCase


class DockerComposeTunnelTests(TestCase):
    def test_tunnel_service_is_opt_in(self) -> None:
        compose = Path(__file__).resolve().parents[1] / "docker-compose.yml"
        content = compose.read_text(encoding="utf-8")
        self.assertIn("profiles:\n      - tunnel", content)
        self.assertIn("command: tunnel --url http://host.docker.internal:4173", content)
