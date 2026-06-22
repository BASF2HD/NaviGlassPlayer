#!/usr/bin/env bash
# Raspberry Pi OS / Debian fresh install helper.

set -euo pipefail

APP_GIT_URL="${APP_GIT_URL:-https://github.com/BASF2HD/NaviGlassPlayer.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/NaviGlassPlayer}"
APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-8787}"
NAVIDROME_VERSION="${NAVIDROME_VERSION:-0.61.2}"
NAVIDROME_USER="${NAVIDROME_USER:-navidrome}"
NAVIDROME_GROUP="${NAVIDROME_GROUP:-navidrome}"
MUSIC_FOLDER="${MUSIC_FOLDER:-/mnt/music}"
DATA_FOLDER="${DATA_FOLDER:-/var/lib/navidrome}"
CONFIG_FILE="${CONFIG_FILE:-/etc/navidrome/navidrome.toml}"
INSTALL_TAILSCALE="${INSTALL_TAILSCALE:-false}"
TAILSCALE_HOSTNAME="${TAILSCALE_HOSTNAME:-raspberrypi-music}"
TAILSCALE_DOMAIN="${TAILSCALE_DOMAIN:-}"

SUDO="sudo"
if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
fi

run() {
  if [[ -n "$SUDO" ]]; then
    "$SUDO" "$@"
  else
    "$@"
  fi
}

arch_suffix() {
  case "$(uname -m)" in
    aarch64|arm64) printf '%s\n' "arm64" ;;
    armv7l|armv6l) printf '%s\n' "armv7" ;;
    x86_64|amd64) printf '%s\n' "amd64" ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
}

install_packages() {
  run apt-get update
  run apt-get install -y ca-certificates curl git ffmpeg
  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | run bash -
    run apt-get install -y nodejs
  fi
}

install_navidrome() {
  suffix="$(arch_suffix)"
  archive="/tmp/navidrome_${NAVIDROME_VERSION}_linux_${suffix}.tar.gz"
  url="https://github.com/navidrome/navidrome/releases/download/v${NAVIDROME_VERSION}/navidrome_${NAVIDROME_VERSION}_linux_${suffix}.tar.gz"

  run install -d -m 755 /opt/navidrome/bin /etc/navidrome "$DATA_FOLDER" "$MUSIC_FOLDER"
  if ! getent group "$NAVIDROME_GROUP" >/dev/null; then
    run groupadd --system "$NAVIDROME_GROUP"
  fi
  if ! id "$NAVIDROME_USER" >/dev/null 2>&1; then
    run useradd --system --gid "$NAVIDROME_GROUP" --home-dir "$DATA_FOLDER" --shell /usr/sbin/nologin "$NAVIDROME_USER"
  fi
  curl -fL "$url" -o "$archive"
  tar -xzf "$archive" -C /tmp navidrome
  run install -m 755 /tmp/navidrome /opt/navidrome/bin/navidrome
  run tee "$CONFIG_FILE" >/dev/null <<EOF
Address = "0.0.0.0"
Port = 4533
MusicFolder = "$MUSIC_FOLDER"
DataFolder = "$DATA_FOLDER"
FFmpegPath = "/usr/bin/ffmpeg"
ScanSchedule = "@every 5m"
LogLevel = "INFO"
EOF
  run chown -R "$NAVIDROME_USER:$NAVIDROME_GROUP" "$DATA_FOLDER"
  run tee /etc/systemd/system/navidrome.service >/dev/null <<EOF
[Unit]
Description=Navidrome Music Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$NAVIDROME_USER
Group=$NAVIDROME_GROUP
WorkingDirectory=$DATA_FOLDER
ExecStart=/opt/navidrome/bin/navidrome --configfile $CONFIG_FILE
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
}

install_naviglassplayer() {
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    git clone "$APP_GIT_URL" "$INSTALL_DIR"
  else
    git -C "$INSTALL_DIR" pull --ff-only
  fi
  run tee /etc/systemd/system/naviglassplayer.service >/dev/null <<EOF
[Unit]
Description=NaviGlassPlayer Client
After=network-online.target navidrome.service
Wants=network-online.target

[Service]
Type=simple
User=${SUDO_USER:-$USER}
Group=$(id -gn "${SUDO_USER:-$USER}")
WorkingDirectory=$INSTALL_DIR
Environment=HOST=$APP_HOST
Environment=PORT=$APP_PORT
Environment=NAVIDROME_ORIGIN=http://127.0.0.1:4533
ExecStart=$(command -v node) $INSTALL_DIR/server.mjs
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
}

install_smart_playlists() {
  if [[ -d "$INSTALL_DIR/smart-playlists" ]]; then
    run mkdir -p "$MUSIC_FOLDER/Smart Playlists"
    run cp "$INSTALL_DIR"/smart-playlists/*.nsp "$MUSIC_FOLDER/Smart Playlists/"
    run chown -R "$NAVIDROME_USER:$NAVIDROME_GROUP" "$MUSIC_FOLDER/Smart Playlists"
  fi
}

install_tailscale() {
  if [[ "$INSTALL_TAILSCALE" != "true" ]]; then
    return
  fi
  curl -fsSL https://tailscale.com/install.sh | sh
  run tailscale up --hostname "$TAILSCALE_HOSTNAME" || true
  if [[ -n "$TAILSCALE_DOMAIN" ]]; then
    run tailscale serve --bg --https=443 http://127.0.0.1:"$APP_PORT"
    run tailscale serve --bg --https=443 --set-path=/navidrome http://127.0.0.1:4533
  fi
}

install_packages
install_navidrome
install_naviglassplayer
install_smart_playlists
run systemctl daemon-reload
run systemctl enable navidrome.service naviglassplayer.service
run systemctl restart navidrome.service naviglassplayer.service
install_tailscale

echo "NaviGlassPlayer: http://<pi-ip>:$APP_PORT"
echo "Navidrome: http://<pi-ip>:4533"
if [[ -n "$TAILSCALE_DOMAIN" ]]; then
  echo "Tailscale NaviGlassPlayer: https://$TAILSCALE_HOSTNAME.$TAILSCALE_DOMAIN/"
  echo "Tailscale Navidrome: https://$TAILSCALE_HOSTNAME.$TAILSCALE_DOMAIN/navidrome/"
fi
