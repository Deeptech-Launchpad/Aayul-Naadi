#!/bin/sh
set -e

# Fail loudly rather than starting an app that cannot decrypt anything.
if [ -z "$AAYU_MASTER_KEY" ]; then
  echo "AAYU_MASTER_KEY is not set. Generate one with: openssl rand -base64 32" >&2
  exit 1
fi
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

echo "Starting Aayu on port ${PORT:-3000}…"
exec node server.js
