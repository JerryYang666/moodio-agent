# ============================================================================
# Stage 1: Builder — install dependencies with uv
# ============================================================================
FROM ghcr.io/astral-sh/uv:0.10.2-python3.12-trixie-slim AS builder

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_NO_DEV=1

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked


# ============================================================================
# Stage 2: Runtime — AWS Lambda base image
# ============================================================================
FROM public.ecr.aws/lambda/python:3.12

COPY --from=builder /app/.venv/lib/python3.12/site-packages/ ${LAMBDA_TASK_ROOT}/

COPY main.py ${LAMBDA_TASK_ROOT}/

CMD ["main.handler"]
