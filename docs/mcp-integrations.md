# MCP Integrations

This document records the local MCP setup used to access training, nutrition, strength, and repository data. It intentionally does not contain API keys, passwords, Garmin credentials, or OAuth tokens.

## Local Configuration

Codex reads MCP server definitions from:

```text
/Users/labela/.codex/config.toml
```

Local wrapper scripts live in:

```text
/Users/labela/.codex/mcp-wrappers/
```

Secrets should be stored outside the repository and outside `config.toml` wherever possible. The preferred storage is macOS Keychain.

## Garmin

Purpose: read Garmin Connect health, running, training, workout, race prediction, VO2 max, training load, and activity data.

The Garmin wrapper uses the `garminconnect` client directly. Set `GARMIN_EMAIL` and `GARMIN_PASSWORD` for the initial login, then the wrapper stores reusable token data under:

```text
~/.garminconnect
```

The wrapper also honors `GARMINTOKENS` when you want to override the tokenstore path. Docker mounts `./.cache/garmin` to `/app/.garminconnect` so repeated `docker compose run` invocations reuse the same session.

No Garmin email or password should be stored in `config.toml`.

Verified Garmin capabilities include:

- latest activity summaries
- running activity history by date range
- VO2 max trend
- race predictions
- training load trend
- activity splits details
- recovery context including HRV, Body Battery, sleep, stress, and resting HR
- personal records for running

Notes:

- Some Garmin tools require explicit approval before access, especially broader activity pulls and trend queries.
- Garmin data should only be queried when explicitly requested.

## Cronometer

Purpose: read and manage nutrition data, food logs, calorie balance, macro targets, micronutrients, and fasting data.

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
- The password should not be stored in `config.toml` or this repository.

Wrapper command:

```bash
uvx cronometer-api-mcp
```

Verified capabilities include:

- food log retrieval
- daily nutrition summary
- macro target retrieval
- fasting history and statistics
- food search and food entry management
- Keep in mind that build artifacts should present Garmin speed records as human-readable paces or distances; raw float values belong only in source or debug context.

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
npx -y -p node@26 -p hevy-mcp hevy-mcp
```

Reason for `node@26`:

- `hevy-mcp@1.25.15` declares `node >=26.0.0`
- the wrapper supplies Node 26 through `npx` instead of requiring a system Node upgrade

Secret handling:

- `HEVY_API_KEY` is stored in macOS Keychain
- the wrapper reads startup exports from the environment
- the API key should not be stored in `config.toml`, the wrapper script, or the repository

Verified capabilities include:

- workout count retrieval
- latest workout retrieval
- paginated workout history
- routines
- exercise templates
- exercise history
- body measurements
- workout and routine create/update tools where supported

Example verified result:

- latest pulled Hevy workout: `Loft`, started `2026-06-30T05:15:15+00:00`, with kettlebell thrusters, incline dumbbell fly, dips, and pull-ups

## GitHub

Purpose: allow Codex to read and write repository files and documentation.

Repository:

```text
lukeabela38/Personal-Trainer
```

Connection method:

- GitHub access is managed through Composio
- connected GitHub user is `lukeabela38`
- repository access is verified by reading the repository root
- write access is verified by committing a test README update on `main`

Verified write commit:

```text
cd3c476a0cfa74c75b380eb2ffdc2d0292131cd4
```

## GitHub Actions Unlock

The GitHub Actions workflows unlock the repo-backed encrypted `.env` file with one repository secret:

- `GIT_CRYPT_KEY`

That key is the base64-encoded `git-crypt export-key` output. After unlock, the workflows read the same `.env` file used locally.

## Live Data Wrappers

The `scripts/wrappers/` directory contains Python scripts that connect to each MCP server and emit JSON in the expected source payload shape.

### Garmin — `scripts/wrappers/fetch_garmin.py`

Calls Garmin MCP tools (`get_vo2max_trend`, `get_latest_activity_summaries`, `get_recovery_context`, `get_training_load_trend`, `get_running_activity_history`) and assembles a normalized source payload. Used by `PERSONAL_TRAINER_GARMIN_COMMAND`.

### Garmin Speed — `scripts/wrappers/fetch_garmin_speed.py`

Calls `get_personal_records` and filters for running records (1K, Mile, 5K, 10K, Half Marathon, Longest Run). Used by `PERSONAL_TRAINER_GARMIN_SPEED_COMMAND`.

### Hevy — `scripts/wrappers/fetch_hevy.py`

Calls `get_latest_workout`, `get_workout_history`, and `get_exercise_history` for tracked exercises. Infers muscle group fatigue from the latest workout. Used by `PERSONAL_TRAINER_HEVY_COMMAND`.
The live Hevy wrapper now pulls a wider recent workout window so the deploy-time snapshot reflects roughly the last 30 days instead of only a short sample.

### Hevy Strength — `scripts/wrappers/fetch_hevy_strength.py`

Calls `get-workouts` and flattens every exercise set from the recent workout window into raw rows for the strength report. The report then groups those rows by exercise so the strength page can show all exercises performed in the last 30 days. Used by `PERSONAL_TRAINER_HEVY_STRENGTH_COMMAND`.

### Cronometer — `scripts/wrappers/fetch_cronometer.py`

Calls `get_daily_nutrition_summary` and `get_macro_targets`. Computes fueling/protein/carb status and log completeness. Used by `PERSONAL_TRAINER_CRONOMETER_COMMAND`.
The wrapper uses `summary.consumed` for consumed calorie and macro totals, and `summary.macros` for calorie target context.
The wrapper caches Cronometer session state in `~/.cronometer_session.json` by default and reuses it before falling back to a fresh login. The Docker pipeline overrides `CRONOMETER_SESSION_FILE` to `/app/.cronometer_session/session.json` and mounts that directory as a named volume so the token survives repeated `docker compose run` invocations.
The live Cronometer wrapper now backfills `recent_days` for the last 30 days so the deploy snapshot can surface a short live nutrition history without a database.

### Manual Check-In — `scripts/wrappers/fetch_manual.py`

Reads check-in data from `PERSONAL_TRAINER_MANUAL_COMMAND` (shell command emitting JSON), then `PERSONAL_TRAINER_MANUAL_FILE` (JSON file path), or falls back to a "missing freshness" default payload.

### Environment Variables

The canonical `.env` lives in the repo as an encrypted file. Unlock it with `git-crypt` before running live commands locally. `.env.example` remains the readable reference for the file structure:

```bash
git-crypt unlock /path/to/git-crypt.key
```

`.env` is auto-loaded by `scripts/mcp_client.py` on import — no shell sourcing needed. Variables already set in your environment take precedence.

Key variables at a glance:

| Variable | Purpose |
|---|---|
| `REPO_ROOT` | Absolute path to the repository |
| `PERSONAL_TRAINER_GARMIN_COMMAND` | Garmin source fetcher |
| `PERSONAL_TRAINER_HEVY_COMMAND` | Hevy source fetcher |
| `PERSONAL_TRAINER_CRONOMETER_COMMAND` | Cronometer source fetcher |
| `PERSONAL_TRAINER_MANUAL_COMMAND` | Manual check-in |
| `PERSONAL_TRAINER_GARMIN_SPEED_COMMAND` | Garmin speed records |
| `PERSONAL_TRAINER_HEVY_STRENGTH_COMMAND` | Hevy exercise history |
| `PERSONAL_TRAINER_GARMIN_MCP_COMMAND` | (optional) override Garmin MCP server command |
| `PERSONAL_TRAINER_HEVY_MCP_COMMAND` | (optional) override Hevy MCP server command |
| `PERSONAL_TRAINER_CRONOMETER_MCP_COMMAND` | (optional) override Cronometer MCP server command |

Each wrapper output is JSON to stdout and describes errors on stderr.
MCP server startup latency is expected on first call (uvx/npx cache).

## Operational Notes

Restart behavior:

- MCP server configuration changes in `config.toml` may require restarting Codex or opening a fresh session
- tool discovery may hot-load newly available tools in a session, but restart is the reliable path

Credential rules:

- Do not commit API keys, passwords, OAuth tokens, or `.garminconnect` token files
- Do not paste secrets into GitHub issues, pull requests, README files, or docs
- Prefer Keychain-backed wrapper scripts for API-key-based tools

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
- Hevy strength-training logs
- GitHub repository files and documentation

Codex should only query personal training, health, nutrition, or repository data when explicitly asked.
