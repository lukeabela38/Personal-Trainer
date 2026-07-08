# Agent Onboarding

This repo is a personal performance system for tracking running, gym, fueling, recovery, and future direct-entry coaching flows.
Agents should optimize for small, independent cards that can be completed without redefining the project.

## What The Project Is

- An integrated performance companion that combines coaching, nutrition guidance, and durable personal data.
- A system that tracks progress across running, gym, fueling, recovery, and direct logging.
- A product that translates training and intake into practical action and feedback.
- A deployment model that stays zero-cost and static by default until a backend layer is justified.

## Canonical Documents

- [Global vision](./global-vision.md)
- [Performance OS charter](./performance-os-charter.md)
- [Data snapshot contract](./data-snapshot-contract.md)
- [Daily recommendation contract](./daily-recommendation-contract.md)
- [Live input boundary](./live-input-boundary.md)
- [Handoff guide](./handoff-guide.md)
- [Zero-cost fitness app IaC brief](./zero-cost-fitness-app-iac-brief.md)

## Current Architecture

- `personal_trainer/src/personal_trainer/` holds the Python seam for live sources and recommendation generation.
- `site/` holds the static browser UI.
- `site/progress.html` compares the current snapshot against the previous snapshot.
- `site/strength.html` shows Hevy PBs and estimated 1RMs.
- `site/speed.html` shows Garmin running PBs.
- `scripts/mcp_client.py` is the reusable MCP stdio client that starts servers and calls tools via JSON-RPC.
- `scripts/wrappers/` contains per-source MCP wrapper scripts (`fetch_garmin.py`, `fetch_hevy.py`, `fetch_cronometer.py`, `fetch_manual.py`, `fetch_garmin_speed.py`, `fetch_hevy_strength.py`) that each emit source payload JSON to stdout.
- `scripts/daily_snapshot_runner.py` is the local end-to-end capture and build entrypoint.
- `.github/workflows/pages.yml` publishes the static site.

## Board Strategy

Use Project 7 as the work queue for multiple agents.

Wave order:

1. `wave-1-contracts`
2. `wave-2-adapters`
3. `wave-3-recommendation`
4. `wave-4-ui`
5. `wave-5-deployment`

## Card Rules

- Keep cards narrow enough that one agent can finish them independently.
- Prefer one issue per behavior, source adapter, or page.
- Add a short acceptance note to each card.
- Any work intended for review must be delivered as a pull request, not a direct commit.
- Unless explicitly told otherwise, create a feature branch and open a PR for reviewable work.
- Do not combine contract changes with UI work unless the card is explicitly about integration.
- Avoid duplicate cards; if scope overlaps, keep the sharper card and archive the broader one.

## Live Data Reporting

When a task touches live external data, keep the report tied to the exact command and time that produced it.

- Do not generalize from stale artifacts such as `dist/` outputs or older turns.
- Re-run the source command before claiming a live value has changed.
- If a source is flaky, rate-limited, or falls back to cached data, say that directly.
- When quoting a live field, pair it with the fresh pull that produced it.

## Start Here For New Work

1. Read the global vision, charter, and snapshot contract first.
2. Check the current board wave label.
3. Pick one `Ready` card.
4. Implement the smallest complete slice.
5. Update docs if the contract or handoff behavior changes.

## Local Commands

Prefer Docker for Python 3.12 runs. Use local Python only as a fallback when Docker is unavailable.

- `./scripts/serve_site.sh`
- `docker compose run --rm app python3 scripts/build_site_artifacts.py`
- `docker compose run --rm app python3 scripts/daily_snapshot_runner.py`
- `python3 ./scripts/wrappers/fetch_garmin.py`
- `python3 ./scripts/wrappers/fetch_hevy.py`
- `python3 ./scripts/wrappers/fetch_cronometer.py`
- `python3 ./scripts/wrappers/fetch_manual.py`
- `python3 ./scripts/wrappers/fetch_garmin_speed.py`
- `python3 ./scripts/wrappers/fetch_hevy_strength.py`

The published Speed view expects Garmin personal records to be normalized into readable paces and distances during the build step, so do not surface raw float seconds/meters in the UI.

Do not commit bulk history snapshot archives. When the progress/history UI needs examples, generate them locally with:

```bash
docker compose run --rm app python3 scripts/generate_history.py
```

## MCP Wrapper Testing Protocol

When wiring a new live data source, follow this protocol to avoid the common pitfalls discovered during initial implementation.

### 1. Discover Tool Names First

MCP servers use inconsistent naming conventions (kebab-case, camelCase, snake_case). Never guess — always call `tools/list`:

```python
# Connect, initialize, send tools/list, inspect the result
await send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
resp = await recv()
for t in resp["result"]["tools"]:
    print(t["name"], t.get("inputSchema", {}).get("properties", {}).keys())
```

Keep this discovery script standalone — do not inline it into the wrapper. The actual tool names may differ from what the README or docs claim.

### 2. Test Each Tool Individually

Before building the full wrapper, test each MCP tool in isolation with its expected arguments:

```python
r = await call_tool(SERVER, "tool-name", {"arg": "value"})
print(type(r).__name__, json.dumps(r, default=str)[:500])
```

Key things to verify:
- **Response shape**: Is it a flat list, a dict with a nested array key (`activities`, `workouts`, `summary`), or a string error?
- **Required arguments**: Some tools require date ranges, IDs, or pagination params even when not obvious.
- **Empty responses**: Does the tool return `[]`, `{}`, or `{"status": "error", ...}` when no data is available?
- **Rate limits**: Garmin returns 429 after repeated auth. Wait 15+ min between credential-based tests.

### 3. Handle Response Shape Variability

Do not assume the tool result is directly usable. Map these common patterns:

| MCP Response Shape | Wrapper Handling |
|---|---|
| `[{...}, {...}]` — flat array | Use directly, possibly slice it |
| `{"activities": [...], "count": N}` | Extract the nested array |
| `{"status": "success", "summary": {...}}` | Dig into the summary key |
| `{"status": "error", "message": "..."}` | Log to stderr, skip gracefully |
| `"Error executing tool ..."` (string) | Log to stderr, skip gracefully |

When in doubt, dump the full response to stderr during development:
```python
print(f"[source] raw response: {json.dumps(result, default=str)[:500]}", file=sys.stderr)
```

### 4. Stream Limit Hazard

`asyncio.create_subprocess_exec` creates a `StreamReader` with a default `_limit` of 64KB. MCP responses (workout history, personal records, exercise history) routinely exceed this. If you see `Separator is found, but chunk is longer than limit`, increase the limit:

```python
if hasattr(proc.stdout, "_limit"):
    proc.stdout._limit = 1024 * 1024  # 1MB
```

Also prefer `proc.stdout.read(65536)` + manual `b"\n"` splitting over `readline()` for the same reason. `scripts/mcp_client.py` already handles both — just be aware if you bypass it.

### 5. Test Credential Loading

Wrappers that support direct API access (Garmin with `GARMIN_EMAIL`/`GARMIN_PASSWORD` in `.env`) must also handle the case when those credentials are absent or expired:

- Verify `.env` loading: `import scripts.mcp_client` should populate `os.environ` from `.env`
- Test with and without credentials: the wrapper should fall back gracefully
- Garmin Connect returns HTTP 429 after repeated logins. If the direct path fails, fall back to MCP mode automatically
- Hevy requires `HEVY_API_KEY` — without it the MCP server won't start
- Cronometer needs `CRONOMETER_USERNAME`/`CRONOMETER_PASSWORD` — without them the API returns `{"status": "error"}`

Wrap the credential check and fallback pattern like this:
```python
if creds_available:
    try:
        return await _fetch_direct(creds)
    except Exception as e:
        print(f"[source] direct failed, falling back to MCP: {e}", file=sys.stderr)
return await _fetch_via_mcp()
```

### 6. Validate the Full Pipeline

After the wrapper emits valid JSON, validate it flows through the full pipeline:

```bash
# 1. Source wrapper outputs valid JSON
python3 scripts/wrappers/fetch_garmin.py | python3 -m json.tool > /dev/null

# 2. Snapshot normalization accepts it
python3 -c "
import asyncio, json, sys
sys.path.insert(0, 'personal_trainer/src')
from personal_trainer.snapshot import build_snapshot
d = json.load(open('/dev/stdin'))
s = build_snapshot({'garmin': d})
print(s['derived']['data_quality'])
" < <(python3 scripts/wrappers/fetch_garmin.py)

# 3. Daily runner produces site artifacts end-to-end
python3 scripts/daily_snapshot_runner.py --date $(date +%F)
```

### 7. Commit Checklist

Before pushing a new wrapper, verify:

- [ ] All MCP tools discovered via `tools/list`, not guessed
- [ ] Each tool tested individually with real MCP server
- [ ] Empty/missing data produces sensible defaults, not crashes
- [ ] Credentials can be set in `.env` (documented in `.env.example`)
- [ ] Direct API path and MCP fallback both tested
- [ ] Wrapper output validates as JSON via `python3 -m json.tool`
- [ ] Snapshot normalization accepts the output
- [ ] `.env.example` updated with any new env vars
- [ ] `docs/mcp-integrations.md` updated with env var table
- [ ] Tests still pass: `PYTHONPATH=src python3 -m unittest discover -s tests` from `personal_trainer/`
- [ ] No credentials, tokens, or personal data committed

## Handoff Notes

- Keep raw data and display data separate.
- Prefer explicit field names over nested blobs in the UI.
- Hide empty values.
- Split fueling guidance by workout day, recovery day, and recommendation output.
