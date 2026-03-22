# ============================================================================
# Stage 1: Builder — install dependencies with uv
# ============================================================================
FROM ghcr.io/astral-sh/uv:0.10.2-python3.12-trixie-slim AS builder

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_NO_DEV=1

# Install dependencies only (cached when lockfile is unchanged)
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

# Copy application source and sync the project itself
COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked


# ============================================================================
# Stage 2: FFmpeg — grab a static ffmpeg binary from BtbN/FFmpeg-Builds (GitHub)
# https://github.com/BtbN/FFmpeg-Builds — automated CI builds from official FFmpeg source
# ============================================================================
FROM public.ecr.aws/lambda/python:3.12 AS ffmpeg-builder

RUN dnf install -y tar xz && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then \
        URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz"; \
    else \
        URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"; \
    fi && \
    curl -fsSL "$URL" | tar -xJ --strip-components=2 -C /usr/local/bin/ --wildcards '*/bin/ffmpeg' '*/bin/ffprobe'


# ============================================================================
# Stage 3: Runtime — AWS Lambda base image
# ============================================================================
FROM public.ecr.aws/lambda/python:3.12

# Copy ffmpeg/ffprobe binaries
COPY --from=ffmpeg-builder /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg-builder /usr/local/bin/ffprobe /usr/local/bin/ffprobe

# Copy the installed virtual environment from the builder
COPY --from=builder /app/.venv/lib/python3.12/site-packages/ ${LAMBDA_TASK_ROOT}/

# Copy application code
COPY main.py ${LAMBDA_TASK_ROOT}/

CMD ["main.handler"]
