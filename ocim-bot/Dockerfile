# OCIM Chemical Inventory Bot — long-polling worker image
# Used by both Railway (auto-detected) and Cloud Run (gcloud run deploy --source .)
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# No port exposed: the bot polls Telegram outbound.
# All secrets come from platform env vars — never bake a .env into the image.
CMD ["python", "telegram_bot_system.py"]
