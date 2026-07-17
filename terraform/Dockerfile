FROM ghcr.io/opentofu/opentofu:1.9-minimal AS tofu

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

COPY --from=tofu /usr/local/bin/tofu /usr/local/bin/tofu

WORKDIR /workspace/terraform

ENTRYPOINT ["tofu"]
