FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv (provides uvx for Garmin and Cronometer MCP servers)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Install Node.js 26 for Hevy MCP server
RUN curl -fsSL https://deb.nodesource.com/setup_26.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

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

# Default command: build the site from example data
CMD ["python3", "scripts/daily_snapshot_runner.py", "--sources-file", "personal_trainer/examples/sources-ready.json"]
