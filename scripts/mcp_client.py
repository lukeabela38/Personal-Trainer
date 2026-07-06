from __future__ import annotations

import asyncio
import json
import shlex
from typing import Any


class McpError(Exception):
    pass


async def call_tool(
    server_command: str,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
    *,
    timeout: float = 60.0,
) -> Any:
    """Start an MCP stdio server, call a tool, and return parsed text content."""

    proc = await asyncio.create_subprocess_exec(
        *shlex.split(server_command),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async def send(msg: dict) -> None:
        proc.stdin.write((json.dumps(msg, ensure_ascii=False) + "\n").encode())
        await proc.stdin.drain()

    async def recv(expected_id: int | None) -> dict:
        while True:
            line = await asyncio.wait_for(proc.stdout.readline(), timeout=timeout)
            if not line:
                stderr = (await proc.stderr.read()).decode() if proc.stderr else ""
                raise McpError(
                    f"MCP server closed stdout unexpectedly.\nstderr: {stderr}"
                )
            msg = json.loads(line)
            if expected_id is None or msg.get("id") == expected_id:
                return msg

    try:
        await send(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "personal-trainer", "version": "0.1.0"},
                },
            }
        )
        init = await recv(1)
        if "error" in init:
            raise McpError(f"initialize error: {init['error']}")

        await send({"jsonrpc": "2.0", "method": "notifications/initialized"})

        await send(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments or {}},
            }
        )
        resp = await recv(2)
        if "error" in resp:
            raise McpError(f"tool '{tool_name}' error: {resp['error']}")

        content = resp.get("result", {}).get("content", [])
        texts = [c["text"] for c in content if c.get("type") == "text"]

        if len(texts) == 1:
            try:
                return json.loads(texts[0])
            except (json.JSONDecodeError, TypeError):
                return texts[0]
        return texts

    finally:
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=5)
        except asyncio.TimeoutError:
            proc.kill()
