#!/usr/bin/env bash
# Безопасный запуск Lavish (аудит 2026-08-25): только loopback, без телеметрии.
# Никогда не запускать на боевом/сетевом боксе и не гонять `lavish-axi update`.
# Usage: ./lavish-safe.sh <path-to-artifact.html>
set -euo pipefail
export LAVISH_AXI_HOST=127.0.0.1        # loopback-only; отключает авто-бинд на Tailscale (H2)
export LAVISH_AXI_TELEMETRY=0           # глушим beacon на a.kunchenguid.com (M1)
unset LAVISH_AXI_ALLOWED_HOSTS 2>/dev/null || true   # никогда не '*' (иначе снимается Host-guard)
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/dist/cli.mjs" "$@"
