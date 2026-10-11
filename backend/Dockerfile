# Backend API image.
#
# Note: this installs PyTorch, so the image is large and the first build is
# slow. For day-to-day development, running the API on the host (uvicorn) against
# the Dockerized data services is usually faster; use this image when you want
# the whole stack containerized or for deployment.

FROM python:3.11-slim

# - PYTHONDONTWRITEBYTECODE: no .pyc clutter in the image
# - PYTHONUNBUFFERED: logs flush immediately (important for our JSON logs)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System libs needed by Pillow/soundfile at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first so Docker layer-caches them across code changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Application code (model weights under Models/ are mounted or baked separately).
COPY . .

EXPOSE 8000

# Apply migrations, then start the server. In production, run migrations as a
# separate step/job instead of on container start.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
