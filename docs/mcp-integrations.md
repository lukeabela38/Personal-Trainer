# MCP Integrations

This document records the local Codex MCP setup used to access training, nutrition, strength, and repository data. It intentionally does not contain API keys, passwords, Garmin credentials, or OAuth tokens.

## Local Configuration

Codex reads MCP server definitions from:

```text
/Users/labela/.codex/config.toml
```

Local wrapper scripts live in:

```text
/Users/labela/.codex/mcp-wrappers/
```

Secrets are stored outside the repository and outside `config.toml` wherever possible. The preferred storage is macOS Keychain.

## Garmin

Purpose: read Garmin Connect health, running, training, workout, race prediction, VO2 max, training load, and activity data.

Configured MCP server:

```toml
[mcp_servers.garmin]
command = "/opt/homebrew/bin/uvx"
args = [
  "--python",
  "3.12",
  "--from",
  "git+https://github.com/Taxuspt/garmin_mcp",
  "garmin-mcp"
]
```

Authentication flow:

```bash
/opt/homebrew/bin/uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp-auth
```

The Garmin auth tool stores reusable token data under:

```text
~/.garminconnect
```

No Garmin email or password is stored in `config.toml`.

Verified capabilities include:

- Latest Garmin activity summaries
- Running activity history by date range
- VO2 max trend
- Race predictions
- Training load trend
- Activity splits and details
- Recovery context such as HRV, Body Battery, sleep, stress, and resting HR

Notes:

- Some Garmin tools are configured to require explicit approval before access, for example broader activity pulls and VO2 max trend queries.
- Garmin data is only queried when explicitly requested.

## Cronometer

Purpose: read and manage nutrition data such as food logs, calorie balance, macro targets, micronutrients, and fasting data.

Configured MCP server:

```toml
[mcp_servers.cronometer]
command = "/Users/labela/.codex/mcp-wrappers/cronometer-api-mcp.sh"
args = []
startup_timeout_sec = 120
```

Wrapper script:

```text
/Users/labela/.codex/mcp-wrappers/cronometer-api-mcp.sh
```

Secret handling:

- Cronometer username is exported by the local wrapper.
- Cronometer password is loaded from macOS Keychain at runtime.
- The password is not stored in `config.toml` or in this repository.

The wrapper runs:

```bash
/opt/homebrew/bin/uvx cronometer-api-mcp
```

Verified capabilities include:

- Food log retrieval
- Daily nutrition summary
- Macro target retrieval
- Fasting history and fasting statistics
- Food search and food entry management

## Hevy

Purpose: read and manage strength-training data from Hevy, including workouts, routines, exercise templates, folders, body measurements, and exercise history.

Configured MCP server:

```toml
[mcp_servers.hevy]
command = "/Users/labela/.codex/mcp-wrappers/hevy-mcp.sh"
args = []
startup_timeout_sec = 120
```

Wrapper script:

```text
/Users/labela/.codex/mcp-wrappers/hevy-mcp.sh
```

The active Hevy wrapper uses the maintained package:

```bash
/opt/homebrew/bin/npx -y -p node@26 -p hevy-mcp hevy-mcp
```

Reason for `node@26`:

- `hevy-mcp@1.25.15` declares `node >=26.0.0`.
- The wrapper supplies Node 26 through `npx` instead of requiring a system Node upgrade.

Secret handling:

- `HEVY_API_KEY` is stored in macOS Keychain.
- The wrapper reads it at startup and exports it as an environment variable.
- The API key is not stored in `config.toml`, in the wrapper text, or in this repository.

Verified capabilities include:

- Workout count retrieval
- Latest workout retrieval
- Paginated workout history
- Routines
- Exercise templates
- Exercise history
- Body measurements
- Workout/routine create and update tools where supported by Hevy

Example verified result:

- Latest pulled Hevy workout at setup time: `Loft`, started `2026-06-30T05:15:15+00:00`, with kettlebell thrusters, incline dumbbell fly, dips, and pull-ups.

## GitHub

Purpose: allow Codex to read and write this repository for documentation and training-tooling work.

Repository:

```text
lukeabela38/Personal-Trainer
```

Connection method:

- GitHub access is managed through Composio.
- The connected GitHub user is `lukeabela38`.
- Repository access was verified by reading the repository root.
- Write access was verified by committing a test README update to `main`.

Verified write commit:

```text
cd3c476a0cfa74c75b380eb2ffdc2d0292131cd4
```

Current documentation commit replaced that temporary test README with this documentation structure.

## Operational Notes

Restart behavior:

- MCP server configuration changes in `config.toml` may require restarting Codex or opening a fresh Codex session.
- Tool discovery may hot-load newly available tools in some sessions, but a restart is the reliable path.

Credential rules:

- Do not commit API keys, passwords, OAuth tokens, or `.garminconnect` token files.
- Do not paste secrets into GitHub issues, pull requests, README files, or docs.
- Prefer Keychain-backed wrapper scripts for API-key based tools.

Useful checks:

```bash
python3 -c 'import tomllib, pathlib; tomllib.loads(pathlib.Path("/Users/labela/.codex/config.toml").read_text()); print("TOML OK")'
```

```bash
rg -n "GARMIN_EMAIL|GARMIN_PASSWORD|HEVY_API_KEY=.*[0-9a-f]|password" /Users/labela/.codex/config.toml /Users/labela/.codex/mcp-wrappers
```

Expected result for the secret scan is no exposed raw credential values.

## Current Training Data Access

With the configured MCP servers, Codex can access, when requested:

- Garmin endurance and recovery data
- Cronometer nutrition data
- Hevy strength training logs
- GitHub repository files and documentation

Codex should only query personal training, health, nutrition, or repository data when explicitly asked.
