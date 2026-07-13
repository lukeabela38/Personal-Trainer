FROM python:3.12-slim-bookworm

# Create non-root user
RUN groupadd --system appgroup && \
    useradd --system --gid appgroup --create-home --home-dir /app appuser

# Install system dependencies and apply security updates
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    libatomic1 \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install uv (provides uvx for Garmin and Cronometer MCP servers)
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/app/.local sh
ENV PATH="/app/.local:${PATH}"

WORKDIR /app

# Copy and install the personal_trainer package
COPY personal_trainer personal_trainer/
COPY scripts scripts/
COPY site site/
COPY .env.example .env.example
COPY Makefile Makefile

RUN python3 -m pip install --upgrade pip==26.1 --quiet \
    && python3 -m pip install -e personal_trainer/ --quiet \
    && python3 -m pip install ruff==0.15.21 garminconnect --quiet

# Pre-cache for pip (no MCP servers needed — all wrappers use direct APIs)

# Set ownership and switch to non-root user
RUN chown -R appuser:appgroup /app /app/.local
USER appuser

# Explicitly no healthcheck needed — container runs on-demand, not as a service
HEALTHCHECK NONE

# Default command: build the site from example data
CMD ["python3", "scripts/daily_snapshot_runner.py", "--sources-file", "personal_trainer/examples/sources-ready.json"]
