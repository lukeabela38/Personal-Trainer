from __future__ import annotations

import asyncio
import json
from unittest import TestCase
from unittest.mock import patch

import scripts.mcp_client as mcp_client


class _FakeStream:
    def __init__(self, chunks: list[bytes] | None = None) -> None:
        self._chunks = list(chunks or [])
        self._written: list[bytes] = []
        self._limit = 65536

    def write(self, data: bytes) -> None:
        self._written.append(data)

    async def drain(self) -> None:
        return None

    async def read(self, _size: int = -1) -> bytes:
        if self._chunks:
            return self._chunks.pop(0)
        return b""


class _FakeProcess:
    def __init__(self, stdout_chunks: list[bytes], stderr_text: str = "") -> None:
        self.stdin = _FakeStream()
        self.stdout = _FakeStream(stdout_chunks)
        self.stderr = _FakeStream([stderr_text.encode("utf-8")])
        self.terminated = False
        self.killed = False
        self.wait_called = False

    def terminate(self) -> None:
        self.terminated = True

    def kill(self) -> None:
        self.killed = True

    async def wait(self) -> int:
        self.wait_called = True
        return 0


class McpClientTests(TestCase):
    def test_call_tool_parses_json_result_and_sends_expected_messages(self) -> None:
        fake_proc = _FakeProcess(
            [
                json.dumps({"jsonrpc": "2.0", "id": 1, "result": {}}).encode("utf-8") + b"\n",
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": json.dumps({"ok": True, "count": 3}),
                                }
                            ]
                        },
                    }
                ).encode("utf-8")
                + b"\n",
            ]
        )

        async def fake_create_subprocess_exec(*args, **kwargs):
            self.assertEqual(args, ("hevy-mcp",))
            self.assertEqual(kwargs["stdin"], asyncio.subprocess.PIPE)
            self.assertEqual(kwargs["stdout"], asyncio.subprocess.PIPE)
            self.assertEqual(kwargs["stderr"], asyncio.subprocess.PIPE)
            return fake_proc

        with patch.object(
            mcp_client.asyncio,
            "create_subprocess_exec",
            side_effect=fake_create_subprocess_exec,
        ):
            result = asyncio.run(
                mcp_client.call_tool("hevy-mcp", "get-exercise-history", {"exerciseTemplateId": "123"})
            )

        self.assertEqual(result, {"ok": True, "count": 3})
        self.assertTrue(fake_proc.terminated)
        sent = [json.loads(chunk.decode("utf-8")) for chunk in fake_proc.stdin._written]
        self.assertEqual(sent[0]["method"], "initialize")
        self.assertEqual(sent[1]["method"], "notifications/initialized")
        self.assertEqual(sent[2]["method"], "tools/call")
        self.assertEqual(sent[2]["params"]["name"], "get-exercise-history")
        self.assertEqual(sent[2]["params"]["arguments"], {"exerciseTemplateId": "123"})

    def test_call_tool_raises_on_tool_error(self) -> None:
        fake_proc = _FakeProcess(
            [
                json.dumps({"jsonrpc": "2.0", "id": 1, "result": {}}).encode("utf-8") + b"\n",
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "error": {"code": -32601, "message": "unknown tool"},
                    }
                ).encode("utf-8")
                + b"\n",
            ]
        )

        async def fake_create_subprocess_exec(*args, **kwargs):
            return fake_proc

        with patch.object(
            mcp_client.asyncio,
            "create_subprocess_exec",
            side_effect=fake_create_subprocess_exec,
        ):
            with self.assertRaisesRegex(mcp_client.McpError, "tool 'missing-tool' error"):
                asyncio.run(mcp_client.call_tool("hevy-mcp", "missing-tool"))

        self.assertTrue(fake_proc.terminated)


if __name__ == "__main__":
    import unittest

    unittest.main()
