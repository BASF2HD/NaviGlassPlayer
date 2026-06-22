#!/bin/sh
# Synology DSM 7 ARM64 fresh install helper.
# Installs Navidrome, NaviGlassPlayer, smart playlist templates, and optional Tailscale Serve.

set -eu

APP_ARCHIVE="${APP_ARCHIVE:-}"
APP_URL="${APP_URL:-https://github.com/BASF2HD/NaviGlassPlayer/archive/refs/heads/main.tar.gz}"
APP_BASE="${APP_BASE:-/volume1/@appdata/naviglassplayer}"
APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-8787}"
DATA_BASE="${DATA_BASE:-/volume1/@appdata/navidrome}"
MUSIC_FOLDER="${MUSIC_FOLDER:-/volume1/Music}"
RUN_USER="${RUN_USER:-$(id -un)}"
RUN_GROUP="${RUN_GROUP:-users}"
NAVIDROME_VERSION="${NAVIDROME_VERSION:-0.61.2}"
NODE_VERSION="${NODE_VERSION:-22.22.3}"
NODE_BASE="${NODE_BASE:-/volume1/@appdata/node}"
INSTALL_TAILSCALE="${INSTALL_TAILSCALE:-false}"
TAILSCALE_SPK_VERSION="${TAILSCALE_SPK_VERSION:-1.98.2-700098002}"
TAILSCALE_HOSTNAME="${TAILSCALE_HOSTNAME:-synology-music}"
TAILSCALE_DOMAIN="${TAILSCALE_DOMAIN:-}"

SUDO="sudo"
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
fi

run() {
  if [ -n "$SUDO" ]; then
    "$SUDO" "$@"
  else
    "$@"
  fi
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

install_navidrome() {
  archive="/tmp/navidrome_${NAVIDROME_VERSION}_linux_arm64.tar.gz"
  url="https://github.com/navidrome/navidrome/releases/download/v${NAVIDROME_VERSION}/navidrome_${NAVIDROME_VERSION}_linux_arm64.tar.gz"

  run mkdir -p "$DATA_BASE/bin" "$DATA_BASE/data" "$DATA_BASE/cache" "$DATA_BASE/logs"
  curl -fL "$url" -o "$archive"
  tar -xzf "$archive" -C /tmp navidrome
  run install -m 755 /tmp/navidrome "$DATA_BASE/bin/navidrome"
  run tee "$DATA_BASE/navidrome.toml" >/dev/null <<EOF
Address = "0.0.0.0"
Port = 4533
MusicFolder = "$MUSIC_FOLDER"
DataFolder = "$DATA_BASE/data"
CacheFolder = "$DATA_BASE/cache"
FFmpegPath = "/usr/bin/ffmpeg"
ScanSchedule = "@every 5m"
LogLevel = "INFO"
EOF
  run chown -R "$RUN_USER:$RUN_GROUP" "$DATA_BASE"
  run tee /etc/systemd/system/navidrome.service >/dev/null <<EOF
[Unit]
Description=Navidrome Music Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$DATA_BASE
ExecStart=$DATA_BASE/bin/navidrome --configfile $DATA_BASE/navidrome.toml
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
}

install_node() {
  if [ -x "$NODE_BASE/bin/node" ]; then
    return
  fi
  archive="/tmp/node-v${NODE_VERSION}-linux-arm64.tar.xz"
  url="https://nodejs.org/download/release/latest-v22.x/node-v${NODE_VERSION}-linux-arm64.tar.xz"
  run mkdir -p "$NODE_BASE"
  curl -fL "$url" -o "$archive"
  run rm -rf "$NODE_BASE"/*
  run tar -xJf "$archive" -C "$NODE_BASE" --strip-components=1
  run chown -R "$RUN_USER:$RUN_GROUP" "$NODE_BASE"
}

install_naviglassplayer() {
  work="/tmp/naviglassplayer-install"
  run rm -rf "$work"
  mkdir -p "$work"
  if [ -n "$APP_ARCHIVE" ]; then
    tar -xzf "$APP_ARCHIVE" -C "$work" --strip-components=0
  else
    curl -fL "$APP_URL" -o /tmp/naviglassplayer.tar.gz
    tar -xzf /tmp/naviglassplayer.tar.gz -C "$work" --strip-components=1
  fi
  run mkdir -p "$APP_BASE"
  run rm -rf "$APP_BASE/public" "$APP_BASE/smart-playlists"
  run cp "$work/server.mjs" "$work/package.json" "$APP_BASE/"
  run cp -R "$work/public" "$work/smart-playlists" "$APP_BASE/"
  run chown -R "$RUN_USER:$RUN_GROUP" "$APP_BASE"
  run tee /etc/systemd/system/naviglassplayer.service >/dev/null <<EOF
[Unit]
Description=NaviGlassPlayer Client
After=network-online.target navidrome.service
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$APP_BASE
Environment=HOST=$APP_HOST
Environment=PORT=$APP_PORT
Environment=NAVIDROME_ORIGIN=http://127.0.0.1:4533
ExecStart=$NODE_BASE/bin/node $APP_BASE/server.mjs
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
}

install_smart_playlists() {
  if [ ! -d "$APP_BASE/smart-playlists" ]; then
    return
  fi
  run mkdir -p "$MUSIC_FOLDER/Smart Playlists"
  run cp "$APP_BASE"/smart-playlists/*.nsp "$MUSIC_FOLDER/Smart Playlists/"
  run chown -R "$RUN_USER:$RUN_GROUP" "$MUSIC_FOLDER/Smart Playlists"
  run chmod 775 "$MUSIC_FOLDER/Smart Playlists"
  run chmod 664 "$MUSIC_FOLDER/Smart Playlists"/*.nsp
}

install_tailscale() {
  if [ "$INSTALL_TAILSCALE" != "true" ]; then
    return
  fi
  spk="/tmp/tailscale-armv8-${TAILSCALE_SPK_VERSION}-dsm7.spk"
  url="https://pkgs.tailscale.com/stable/tailscale-armv8-${TAILSCALE_SPK_VERSION}-dsm7.spk"
  curl -fL "$url" -o "$spk"
  run /usr/syno/bin/synopkg install "$spk"
  run /usr/syno/bin/synopkg start Tailscale || true
  run /var/packages/Tailscale/target/bin/tailscale up --hostname "$TAILSCALE_HOSTNAME" || true
  if [ -n "$TAILSCALE_DOMAIN" ]; then
    run /var/packages/Tailscale/target/bin/tailscale serve --bg --https=443 http://127.0.0.1:"$APP_PORT"
    run /var/packages/Tailscale/target/bin/tailscale serve --bg --https=443 --set-path=/navidrome http://127.0.0.1:4533
  fi
}

need_cmd curl
need_cmd tar
need_cmd systemctl
need_cmd ffmpeg

install_navidrome
install_node
install_naviglassplayer
install_smart_playlists
run systemctl daemon-reload
run systemctl enable navidrome.service naviglassplayer.service
run systemctl restart navidrome.service naviglassplayer.service
install_tailscale

echo "NaviGlassPlayer:  http://<nas-ip>:$APP_PORT"
echo "Navidrome:  http://<nas-ip>:4533"
if [ -n "$TAILSCALE_DOMAIN" ]; then
  echo "Tailscale NaviGlassPlayer: https://$TAILSCALE_HOSTNAME.$TAILSCALE_DOMAIN/"
  echo "Tailscale Navidrome: https://$TAILSCALE_HOSTNAME.$TAILSCALE_DOMAIN/navidrome/"
fi
