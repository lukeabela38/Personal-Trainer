FROM python:3.12-slim-bookworm

# Create non-root user
RUN groupadd --system appgroup && \
    useradd --system --gid appgroup --create-home --home-dir /app appuser

# Install system dependencies and apply security updates
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv (provides uvx for Garmin and Cronometer MCP servers)
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/app/.local sh
ENV PATH="/app/.local/bin:${PATH}"

# Install Node.js 26 for Hevy MCP server
RUN curl -fsSL https://deb.nodesource.com/setup_26.x -o /tmp/nodesetup.sh \
    && bash /tmp/nodesetup.sh \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* /tmp/nodesetup.sh

WORKDIR /app

# Copy and install the personal_trainer package
COPY personal_trainer personal_trainer/
COPY scripts scripts/
COPY site site/
COPY .env.example .env.example
COPY Makefile Makefile

RUN pip install -e personal_trainer/ --quiet \
    && pip install ruff garminconnect --quiet

# Pre-cache MCP environments for faster first use
RUN uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp --help > /dev/null 2>&1 || true
RUN npx -y -p node@26 -p hevy-mcp hevy-mcp --help > /dev/null 2>&1 || true
RUN uvx cronometer-api-mcp --help > /dev/null 2>&1 || true

# Set ownership and switch to non-root user
RUN chown -R appuser:appgroup /app /app/.local
USER appuser

# Default command: build the site from example data
CMD ["python3", "scripts/daily_snapshot_runner.py", "--sources-file", "personal_trainer/examples/sources-ready.json"]
