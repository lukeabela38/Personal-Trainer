.PHONY: build site shell test lint generate-history

# ── Docker-based commands ──────────────────────────────────────────

build:
	docker compose build

site:
	docker compose up site

shell:
	docker compose run --rm app /bin/bash

test:
	docker compose run --rm app sh -c "PYTHONPATH=personal_trainer/src python3 -m unittest discover -s personal_trainer/tests -v"

lint:
	docker compose run --rm app sh -c "cd personal_trainer && ruff check src tests"

generate-history:
	docker compose run --rm generate-history

# ── Native commands (requires Python 3.11+, uv, node) ─────────────

native-test:
	PYTHONPATH=personal_trainer/src python3 -m unittest discover -s personal_trainer/tests -v

native-lint:
	cd personal_trainer && ruff check src tests

native-serve:
	python3 scripts/build_site_artifacts.py && python3 -m http.server 4173 -d dist

native-generate:
	PYTHONPATH=personal_trainer/src python3 scripts/generate_history.py
