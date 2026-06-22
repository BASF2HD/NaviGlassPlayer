#!/usr/bin/env bash
# =============================================================================
# Rocky Linux fresh install / deploy helper (Navidrome + NaviGlassPlayer)
# =============================================================================
# Typical Rocky fresh-install flow:
#
#   ssh your-user@your-server
#   git clone https://github.com/BASF2HD/NaviGlassPlayer.git ~/NaviGlassPlayer
#   cd ~/NaviGlassPlayer
#   bash scripts/deploy-rocky.sh --auto
#
# If you only copied this script onto the server:
#
#   APP_GIT_URL=https://github.com/BASF2HD/NaviGlassPlayer.git \
#   bash deploy-rocky.sh --clone ~/NaviGlassPlayer --auto
#
# What this script does by default:
#   - Installs Node.js 20 LTS and base OS packages
#   - Installs ffmpeg
#   - Installs Navidrome as a local systemd service on port 4533
#   - Installs the NaviGlassPlayer client as a local systemd service
#   - Opens the configured app ports in firewalld
# =============================================================================

set -euo pipefail

DEFAULT_APP_GIT_URL="https://github.com/BASF2HD/NaviGlassPlayer.git"
DEFAULT_APP_VARIANT="naviglassplayer"
DEFAULT_APP_HOST="0.0.0.0"
DEFAULT_APP_PORT="8787"
DEFAULT_INSTALL_DIR="${HOME}/NaviGlassPlayer"

DEFAULT_INSTALL_NAVIDROME="true"
DEFAULT_NAVIDROME_ORIGIN="http://127.0.0.1:4533"
DEFAULT_NAVIDROME_HOST="0.0.0.0"
DEFAULT_NAVIDROME_PORT="4533"
DEFAULT_NAVIDROME_SERVICE_NAME="navidrome"
DEFAULT_NAVIDROME_VERSION="latest"
DEFAULT_NAVIDROME_USER="navidrome"
DEFAULT_NAVIDROME_GROUP="navidrome"
DEFAULT_NAVIDROME_INSTALL_ROOT="/opt/navidrome"
DEFAULT_NAVIDROME_BIN_DIR="/opt/navidrome/bin"
DEFAULT_NAVIDROME_MUSIC_FOLDER="/opt/navidrome/music"
DEFAULT_NAVIDROME_DATA_FOLDER="/var/lib/navidrome"
DEFAULT_NAVIDROME_CONFIG_FILE="/etc/navidrome/navidrome.toml"
DEFAULT_NAVIDROME_SCAN_SCHEDULE="@every 5m"
DEFAULT_NAVIDROME_GIT_URL="https://github.com/navidrome/navidrome.git"
DEFAULT_CLEANUP_DOCKER_NAVIDROME="true"

APP_GIT_URL="${APP_GIT_URL:-$DEFAULT_APP_GIT_URL}"
APP_GIT_SSH_KEY_PATH="${APP_GIT_SSH_KEY_PATH:-}"
APP_VARIANT_OVERRIDE="${APP_VARIANT:-}"
APP_PORT_OVERRIDE="${APP_PORT:-}"
NAVIDROME_ORIGIN_OVERRIDE="${NAVIDROME_ORIGIN:-}"
INSTALL_DIR_OVERRIDE="${INSTALL_DIR:-}"
INSTALL_NAVIDROME_OVERRIDE="${INSTALL_NAVIDROME:-}"
NAVIDROME_HOST_OVERRIDE="${NAVIDROME_HOST:-}"
NAVIDROME_PORT_OVERRIDE="${NAVIDROME_PORT:-}"
NAVIDROME_SERVICE_NAME_OVERRIDE="${NAVIDROME_SERVICE_NAME:-}"
NAVIDROME_VERSION_OVERRIDE="${NAVIDROME_VERSION:-}"
NAVIDROME_USER_OVERRIDE="${NAVIDROME_USER:-}"
NAVIDROME_GROUP_OVERRIDE="${NAVIDROME_GROUP:-}"
NAVIDROME_BIN_DIR_OVERRIDE="${NAVIDROME_BIN_DIR:-}"
NAVIDROME_MUSIC_FOLDER_OVERRIDE="${NAVIDROME_MUSIC_FOLDER:-}"
NAVIDROME_DATA_FOLDER_OVERRIDE="${NAVIDROME_DATA_FOLDER:-}"
NAVIDROME_CONFIG_FILE_OVERRIDE="${NAVIDROME_CONFIG_FILE:-}"
NAVIDROME_SCAN_SCHEDULE_OVERRIDE="${NAVIDROME_SCAN_SCHEDULE:-}"
UPLOAD_USER_OVERRIDE="${UPLOAD_USER:-}"
CLEANUP_DOCKER_NAVIDROME_OVERRIDE="${CLEANUP_DOCKER_NAVIDROME:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-$REPO_ROOT/deploy-rocky.env}"
ENV_FILE_EXPLICIT=false
SKIP_INSTALL=false
SKIP_FIREWALL=false
SKIP_SYSTEMD=false
SKIP_NAVIDROME=false
AUTO_DEPLOY=false
PRINT_ENV_TEMPLATE=false
CLONE_MODE=false
CLONE_DEST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto) AUTO_DEPLOY=true; shift ;;
    --print-env-template) PRINT_ENV_TEMPLATE=true; shift ;;
    --env-file)
      ENV_FILE="$2"
      ENV_FILE_EXPLICIT=true
      shift 2
      ;;
    --clone)
      CLONE_MODE=true
      if [[ -n "${2:-}" && "${2:0:1}" != "-" ]]; then
        CLONE_DEST="$2"
        shift 2
      else
        shift
      fi
      ;;
    --app)
      APP_VARIANT_OVERRIDE="$2"
      shift 2
      ;;
    --port)
      APP_PORT_OVERRIDE="$2"
      shift 2
      ;;
    --navidrome-origin)
      NAVIDROME_ORIGIN_OVERRIDE="$2"
      shift 2
      ;;
    --navidrome-port)
      NAVIDROME_PORT_OVERRIDE="$2"
      shift 2
      ;;
    --navidrome-host)
      NAVIDROME_HOST_OVERRIDE="$2"
      shift 2
      ;;
    --navidrome-version)
      NAVIDROME_VERSION_OVERRIDE="$2"
      shift 2
      ;;
    --music-folder)
      NAVIDROME_MUSIC_FOLDER_OVERRIDE="$2"
      shift 2
      ;;
    --data-folder)
      NAVIDROME_DATA_FOLDER_OVERRIDE="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR_OVERRIDE="$2"
      shift 2
      ;;
    --upload-user)
      UPLOAD_USER_OVERRIDE="$2"
      shift 2
      ;;
    --skip-install) SKIP_INSTALL=true; shift ;;
    --skip-firewall) SKIP_FIREWALL=true; shift ;;
    --skip-systemd) SKIP_SYSTEMD=true; shift ;;
    --skip-navidrome) SKIP_NAVIDROME=true; shift ;;
    --cleanup-docker-navidrome) CLEANUP_DOCKER_NAVIDROME_OVERRIDE="true"; shift ;;
    --keep-docker-navidrome|--no-cleanup-docker-navidrome) CLEANUP_DOCKER_NAVIDROME_OVERRIDE="false"; shift ;;
    -h|--help)
      sed -n '1,80p' "$0" | tail -n +2
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

run() {
  if [[ -n "$SUDO" ]]; then
    "$SUDO" "$@"
  else
    "$@"
  fi
}

die() {
  echo "Error: $*" >&2
  exit 1
}

expand_path() {
  local input="$1"
  case "$input" in
    "~") printf '%s\n' "$HOME" ;;
    "~/"*) printf '%s/%s\n' "$HOME" "${input#~/}" ;;
    *) printf '%s\n' "$input" ;;
  esac
}

normalize_bool() {
  local raw="${1:-}"
  case "${raw,,}" in
    1|true|yes|on) printf '%s\n' "true" ;;
    0|false|no|off) printf '%s\n' "false" ;;
    *)
      die "Expected a boolean value, got: $raw"
      ;;
  esac
}

repo_owner_user() {
  local target="$1"
  local owner
  owner="$(stat -c '%U' "$target" 2>/dev/null || true)"
  if [[ -n "$owner" ]]; then
    printf '%s\n' "$owner"
    return 0
  fi
  printf '%s\n' "${SUDO_USER:-$USER}"
}

repo_owner_group() {
  local target="$1"
  local group
  group="$(stat -c '%G' "$target" 2>/dev/null || true)"
  if [[ -n "$group" ]]; then
    printf '%s\n' "$group"
    return 0
  fi
  id -gn "${SUDO_USER:-$USER}"
}

git_uses_ssh() {
  local url="${1:-$APP_GIT_URL}"
  [[ "$url" == git@*:* || "$url" == ssh://* ]]
}

default_git_ssh_key_path() {
  local owner home_dir
  owner="${SUDO_USER:-$USER}"
  home_dir="$(getent passwd "$owner" 2>/dev/null | cut -d: -f6 || true)"
  if [[ -z "$home_dir" ]]; then
    home_dir="$HOME"
  fi
  printf '%s/.ssh/naviglassplayer_deploy\n' "$home_dir"
}

prepare_git_settings() {
  if ! git_uses_ssh "$APP_GIT_URL"; then
    return 0
  fi

  if [[ -z "$APP_GIT_SSH_KEY_PATH" ]]; then
    APP_GIT_SSH_KEY_PATH="$(default_git_ssh_key_path)"
  fi
  APP_GIT_SSH_KEY_PATH="$(expand_path "$APP_GIT_SSH_KEY_PATH")"

  [[ -f "$APP_GIT_SSH_KEY_PATH" ]] || die "Missing deploy key: $APP_GIT_SSH_KEY_PATH"
  command -v ssh >/dev/null 2>&1 || die "Missing ssh client. Install openssh-clients."
}

build_git_ssh_command() {
  local ssh_cmd
  printf -v ssh_cmd 'ssh -i %q -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' "$APP_GIT_SSH_KEY_PATH"
  printf '%s\n' "$ssh_cmd"
}

git_clone_checkout() {
  local dest="$1"
  local ssh_cmd

  if git_uses_ssh "$APP_GIT_URL"; then
    prepare_git_settings
    ssh_cmd="$(build_git_ssh_command)"
    GIT_SSH_COMMAND="$ssh_cmd" git clone "$APP_GIT_URL" "$dest"
  else
    git clone "$APP_GIT_URL" "$dest"
  fi
}

repo_git() {
  local repo="$1"
  shift
  local owner ssh_cmd=""
  owner="$(repo_owner_user "$repo")"

  if git_uses_ssh "$APP_GIT_URL"; then
    prepare_git_settings
    ssh_cmd="$(build_git_ssh_command)"
  fi

  if [[ "${EUID}" -eq 0 && -n "$owner" && "$owner" != "root" ]]; then
    if [[ -n "$ssh_cmd" ]]; then
      sudo -u "$owner" env GIT_SSH_COMMAND="$ssh_cmd" git -C "$repo" "$@"
    else
      sudo -u "$owner" git -C "$repo" "$@"
    fi
  else
    if [[ -n "$ssh_cmd" ]]; then
      env GIT_SSH_COMMAND="$ssh_cmd" git -C "$repo" "$@"
    else
      git -C "$repo" "$@"
    fi
  fi
}

repo_git_local() {
  local repo="$1"
  shift
  local owner
  owner="$(repo_owner_user "$repo")"

  if [[ "${EUID}" -eq 0 && -n "$owner" && "$owner" != "root" ]]; then
    sudo -u "$owner" git -C "$repo" "$@"
  else
    git -C "$repo" "$@"
  fi
}

git_pull_checkout() {
  local repo="$1"
  local remote_url

  remote_url="$(repo_git_local "$repo" remote get-url origin 2>/dev/null || true)"
  if [[ -z "$remote_url" ]]; then
    echo "[git] No origin remote configured. Skipping git pull."
    return 0
  fi

  if ! repo_git_local "$repo" diff --quiet || ! repo_git_local "$repo" diff --cached --quiet; then
    echo "[git] Working tree is not clean. Skipping git pull --ff-only."
    return 0
  fi

  if [[ "$remote_url" != "$APP_GIT_URL" ]]; then
    repo_git "$repo" remote set-url origin "$APP_GIT_URL"
  fi

  repo_git "$repo" pull --ff-only
}

if [[ "$CLONE_MODE" == true ]]; then
  DEST="${CLONE_DEST:-$DEFAULT_INSTALL_DIR}"

  if ! command -v git >/dev/null 2>&1; then
    if [[ "${EUID}" -eq 0 ]]; then
      dnf install -y git
    else
      sudo dnf install -y git
    fi
  fi

  echo "Using repository: $APP_GIT_URL"
  echo "Target directory: $DEST"

  if [[ -e "$DEST" ]]; then
    die "Target path already exists: $DEST"
  fi

  git_clone_checkout "$DEST"

  if [[ "${EUID}" -eq 0 ]]; then
    local_owner="${SUDO_USER:-root}"
    local_group="$(id -gn "$local_owner" 2>/dev/null || printf '%s' "$local_owner")"
    chown -R "$local_owner:$local_group" "$DEST"
  fi

  INSTALL_DIR_OVERRIDE="$DEST"
  if [[ "$ENV_FILE_EXPLICIT" == false ]]; then
    ENV_FILE="$DEST/deploy-rocky.env"
  fi
fi

print_env_template() {
  local install_dir
  install_dir="${INSTALL_DIR_OVERRIDE:-$REPO_ROOT}"
  cat <<EOF
# Rocky deploy settings for scripts/deploy-rocky.sh
# Save this as deploy-rocky.env on the server. Do not commit it.

APP_GIT_URL=$APP_GIT_URL
INSTALL_DIR=$install_dir
APP_VARIANT=${APP_VARIANT_OVERRIDE:-$DEFAULT_APP_VARIANT}
APP_HOST=$DEFAULT_APP_HOST
APP_PORT=
INSTALL_NAVIDROME=${INSTALL_NAVIDROME_OVERRIDE:-$DEFAULT_INSTALL_NAVIDROME}
NAVIDROME_ORIGIN=${NAVIDROME_ORIGIN_OVERRIDE:-$DEFAULT_NAVIDROME_ORIGIN}
NAVIDROME_HOST=${NAVIDROME_HOST_OVERRIDE:-$DEFAULT_NAVIDROME_HOST}
NAVIDROME_PORT=${NAVIDROME_PORT_OVERRIDE:-$DEFAULT_NAVIDROME_PORT}
NAVIDROME_SERVICE_NAME=${NAVIDROME_SERVICE_NAME_OVERRIDE:-$DEFAULT_NAVIDROME_SERVICE_NAME}
NAVIDROME_VERSION=${NAVIDROME_VERSION_OVERRIDE:-$DEFAULT_NAVIDROME_VERSION}
NAVIDROME_USER=${NAVIDROME_USER_OVERRIDE:-$DEFAULT_NAVIDROME_USER}
NAVIDROME_GROUP=${NAVIDROME_GROUP_OVERRIDE:-$DEFAULT_NAVIDROME_GROUP}
NAVIDROME_BIN_DIR=${NAVIDROME_BIN_DIR_OVERRIDE:-$DEFAULT_NAVIDROME_BIN_DIR}
NAVIDROME_MUSIC_FOLDER=${NAVIDROME_MUSIC_FOLDER_OVERRIDE:-$DEFAULT_NAVIDROME_MUSIC_FOLDER}
NAVIDROME_DATA_FOLDER=${NAVIDROME_DATA_FOLDER_OVERRIDE:-$DEFAULT_NAVIDROME_DATA_FOLDER}
NAVIDROME_CONFIG_FILE=${NAVIDROME_CONFIG_FILE_OVERRIDE:-$DEFAULT_NAVIDROME_CONFIG_FILE}
NAVIDROME_SCAN_SCHEDULE='${NAVIDROME_SCAN_SCHEDULE_OVERRIDE:-$DEFAULT_NAVIDROME_SCAN_SCHEDULE}'
CLEANUP_DOCKER_NAVIDROME=${CLEANUP_DOCKER_NAVIDROME_OVERRIDE:-$DEFAULT_CLEANUP_DOCKER_NAVIDROME}
UPLOAD_USER=${UPLOAD_USER_OVERRIDE:-}
SERVICE_NAME=
FIREWALL_PORT=
APP_GIT_SSH_KEY_PATH=
EOF
}

if [[ "$PRINT_ENV_TEMPLATE" == true ]]; then
  print_env_template
  exit 0
fi

if [[ "$AUTO_DEPLOY" == true && ! -f "$ENV_FILE" ]]; then
  mkdir -p "$(dirname "$ENV_FILE")"
  {
    echo "# AUTO-GENERATED $(date -u +%Y-%m-%dT%H:%M:%SZ) by deploy-rocky.sh --auto"
    print_env_template
  } >"$ENV_FILE"
fi

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -n "$APP_VARIANT_OVERRIDE" ]]; then APP_VARIANT="$APP_VARIANT_OVERRIDE"; fi
if [[ -n "$APP_PORT_OVERRIDE" ]]; then APP_PORT="$APP_PORT_OVERRIDE"; fi
if [[ -n "$NAVIDROME_ORIGIN_OVERRIDE" ]]; then NAVIDROME_ORIGIN="$NAVIDROME_ORIGIN_OVERRIDE"; fi
if [[ -n "$INSTALL_DIR_OVERRIDE" ]]; then INSTALL_DIR="$INSTALL_DIR_OVERRIDE"; fi
if [[ -n "$INSTALL_NAVIDROME_OVERRIDE" ]]; then INSTALL_NAVIDROME="$INSTALL_NAVIDROME_OVERRIDE"; fi
if [[ -n "$NAVIDROME_HOST_OVERRIDE" ]]; then NAVIDROME_HOST="$NAVIDROME_HOST_OVERRIDE"; fi
if [[ -n "$NAVIDROME_PORT_OVERRIDE" ]]; then NAVIDROME_PORT="$NAVIDROME_PORT_OVERRIDE"; fi
if [[ -n "$NAVIDROME_SERVICE_NAME_OVERRIDE" ]]; then NAVIDROME_SERVICE_NAME="$NAVIDROME_SERVICE_NAME_OVERRIDE"; fi
if [[ -n "$NAVIDROME_VERSION_OVERRIDE" ]]; then NAVIDROME_VERSION="$NAVIDROME_VERSION_OVERRIDE"; fi
if [[ -n "$NAVIDROME_USER_OVERRIDE" ]]; then NAVIDROME_USER="$NAVIDROME_USER_OVERRIDE"; fi
if [[ -n "$NAVIDROME_GROUP_OVERRIDE" ]]; then NAVIDROME_GROUP="$NAVIDROME_GROUP_OVERRIDE"; fi
if [[ -n "$NAVIDROME_BIN_DIR_OVERRIDE" ]]; then NAVIDROME_BIN_DIR="$NAVIDROME_BIN_DIR_OVERRIDE"; fi
if [[ -n "$NAVIDROME_MUSIC_FOLDER_OVERRIDE" ]]; then NAVIDROME_MUSIC_FOLDER="$NAVIDROME_MUSIC_FOLDER_OVERRIDE"; fi
if [[ -n "$NAVIDROME_DATA_FOLDER_OVERRIDE" ]]; then NAVIDROME_DATA_FOLDER="$NAVIDROME_DATA_FOLDER_OVERRIDE"; fi
if [[ -n "$NAVIDROME_CONFIG_FILE_OVERRIDE" ]]; then NAVIDROME_CONFIG_FILE="$NAVIDROME_CONFIG_FILE_OVERRIDE"; fi
if [[ -n "$NAVIDROME_SCAN_SCHEDULE_OVERRIDE" ]]; then NAVIDROME_SCAN_SCHEDULE="$NAVIDROME_SCAN_SCHEDULE_OVERRIDE"; fi
if [[ -n "$UPLOAD_USER_OVERRIDE" ]]; then UPLOAD_USER="$UPLOAD_USER_OVERRIDE"; fi
if [[ -n "$CLEANUP_DOCKER_NAVIDROME_OVERRIDE" ]]; then CLEANUP_DOCKER_NAVIDROME="$CLEANUP_DOCKER_NAVIDROME_OVERRIDE"; fi

APP_VARIANT="${APP_VARIANT:-$DEFAULT_APP_VARIANT}"
APP_HOST="${APP_HOST:-$DEFAULT_APP_HOST}"
INSTALL_DIR="${INSTALL_DIR:-$REPO_ROOT}"
INSTALL_NAVIDROME="${INSTALL_NAVIDROME:-$DEFAULT_INSTALL_NAVIDROME}"
NAVIDROME_HOST="${NAVIDROME_HOST:-$DEFAULT_NAVIDROME_HOST}"
NAVIDROME_PORT="${NAVIDROME_PORT:-$DEFAULT_NAVIDROME_PORT}"
NAVIDROME_SERVICE_NAME="${NAVIDROME_SERVICE_NAME:-$DEFAULT_NAVIDROME_SERVICE_NAME}"
NAVIDROME_VERSION="${NAVIDROME_VERSION:-$DEFAULT_NAVIDROME_VERSION}"
NAVIDROME_USER="${NAVIDROME_USER:-$DEFAULT_NAVIDROME_USER}"
NAVIDROME_GROUP="${NAVIDROME_GROUP:-$DEFAULT_NAVIDROME_GROUP}"
NAVIDROME_BIN_DIR="${NAVIDROME_BIN_DIR:-$DEFAULT_NAVIDROME_BIN_DIR}"
NAVIDROME_MUSIC_FOLDER="${NAVIDROME_MUSIC_FOLDER:-$DEFAULT_NAVIDROME_MUSIC_FOLDER}"
NAVIDROME_DATA_FOLDER="${NAVIDROME_DATA_FOLDER:-$DEFAULT_NAVIDROME_DATA_FOLDER}"
NAVIDROME_CONFIG_FILE="${NAVIDROME_CONFIG_FILE:-$DEFAULT_NAVIDROME_CONFIG_FILE}"
NAVIDROME_SCAN_SCHEDULE="${NAVIDROME_SCAN_SCHEDULE:-$DEFAULT_NAVIDROME_SCAN_SCHEDULE}"
CLEANUP_DOCKER_NAVIDROME="${CLEANUP_DOCKER_NAVIDROME:-$DEFAULT_CLEANUP_DOCKER_NAVIDROME}"

INSTALL_NAVIDROME="$(normalize_bool "$INSTALL_NAVIDROME")"
CLEANUP_DOCKER_NAVIDROME="$(normalize_bool "$CLEANUP_DOCKER_NAVIDROME")"
if [[ "$SKIP_NAVIDROME" == true ]]; then
  INSTALL_NAVIDROME="false"
fi

case "$APP_VARIANT" in
  naviglassplayer)
    DEFAULT_APP_PORT_FOR_VARIANT="8787"
    ;;
  *)
    die "APP_VARIANT must be naviglassplayer"
    ;;
esac

APP_PORT="${APP_PORT:-$DEFAULT_APP_PORT_FOR_VARIANT}"
FIREWALL_PORT="${FIREWALL_PORT:-$APP_PORT}"
SERVICE_NAME="${SERVICE_NAME:-naviglassplayer}"

INSTALL_DIR="$(expand_path "$INSTALL_DIR")"
REPO_ROOT="$INSTALL_DIR"
APP_DIR="$REPO_ROOT"
if [[ -d "$REPO_ROOT/apps/$APP_VARIANT" ]]; then
  APP_DIR="$REPO_ROOT/apps/$APP_VARIANT"
fi
APP_USER="$(repo_owner_user "$REPO_ROOT")"
APP_GROUP="$(repo_owner_group "$REPO_ROOT")"
APP_UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

NAVIDROME_BIN_DIR="$(expand_path "$NAVIDROME_BIN_DIR")"
NAVIDROME_MUSIC_FOLDER="$(expand_path "$NAVIDROME_MUSIC_FOLDER")"
NAVIDROME_DATA_FOLDER="$(expand_path "$NAVIDROME_DATA_FOLDER")"
NAVIDROME_CONFIG_FILE="$(expand_path "$NAVIDROME_CONFIG_FILE")"
NAVIDROME_INSTALL_ROOT="$(dirname "$NAVIDROME_BIN_DIR")"
NAVIDROME_UNIT_PATH="/etc/systemd/system/${NAVIDROME_SERVICE_NAME}.service"
UPLOAD_USER="${UPLOAD_USER:-${SUDO_USER:-$APP_USER}}"

if [[ -z "${NAVIDROME_ORIGIN:-}" ]]; then
  NAVIDROME_ORIGIN="http://127.0.0.1:${NAVIDROME_PORT}"
fi

require_file() {
  [[ -f "$1" ]] || die "Missing file: $1"
}

require_file "$APP_DIR/package.json"
require_file "$APP_DIR/server.mjs"

node_major_version() {
  if ! command -v node >/dev/null 2>&1; then
    echo 0
    return 0
  fi
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0
}

ensure_nodejs() {
  local major
  major="$(node_major_version)"
  if [[ "$major" -ge 20 ]]; then
    echo "[1/7] Node.js $major already installed."
    return 0
  fi

  echo "[1/7] Installing Node.js 20 LTS..."
  run bash -lc 'curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -'
  run dnf install -y nodejs
}

ensure_ffmpeg() {
  if command -v ffmpeg >/dev/null 2>&1; then
    return 0
  fi

  if ! rpm -q epel-release >/dev/null 2>&1; then
    run dnf install -y epel-release
  fi

  if ! rpm -q rpmfusion-free-release >/dev/null 2>&1; then
    run dnf install -y "https://mirrors.rpmfusion.org/free/el/rpmfusion-free-release-$(rpm -E %rhel).noarch.rpm"
  fi

  run dnf config-manager --set-enabled crb || true
  run dnf install -y ffmpeg
}

install_packages() {
  if [[ "$SKIP_INSTALL" == true ]]; then
    echo "[1/7] Skipping OS package install (--skip-install)"
    return 0
  fi

  echo "[1/7] Installing Rocky packages..."
  run dnf install -y dnf-plugins-core git curl ca-certificates firewalld openssh-clients tar shadow-utils
  run systemctl enable --now firewalld
  ensure_nodejs
  ensure_ffmpeg
}

prepare_checkout() {
  echo "[2/7] Preparing repo checkout..."
  [[ -d "$REPO_ROOT/.git" ]] || die "Expected git checkout at $REPO_ROOT"
  git_pull_checkout "$REPO_ROOT"
}

cleanup_conflicting_docker_navidrome() {
  local container_ids compose_file backup_file timestamp

  if [[ "$INSTALL_NAVIDROME" != "true" || "$CLEANUP_DOCKER_NAVIDROME" != "true" ]]; then
    return 0
  fi

  command -v docker >/dev/null 2>&1 || return 0

  container_ids="$(
    {
      run docker ps -a --filter "publish=${NAVIDROME_PORT}" --format '{{.ID}}' 2>/dev/null || true
      run docker ps -a --filter "name=navidrome" --format '{{.ID}}' 2>/dev/null || true
    } | sort -u
  )"

  [[ -n "$container_ids" ]] || return 0

  echo "[3/7] Cleaning up existing Docker Navidrome before native install..."
  echo "      Preserving host data folders; removing only conflicting containers."

  compose_file="/opt/navidrome/docker-compose.yml"
  if [[ -f "$compose_file" ]] && grep -qi "navidrome" "$compose_file"; then
    timestamp="$(date -u +%Y%m%d-%H%M%S)"
    backup_file="${compose_file}.disabled-${timestamp}"
    if run docker compose -f "$compose_file" down; then
      run mv "$compose_file" "$backup_file"
      echo "      Docker Compose stack stopped. Compose file disabled: $backup_file"
    fi
  fi

  # shellcheck disable=SC2086
  run docker rm -f $container_ids >/dev/null 2>&1 || true
}

warn_if_music_folder_looks_empty() {
  local audio_in_folder audio_in_parent parent

  [[ -d "$NAVIDROME_MUSIC_FOLDER" ]] || return 0

  audio_in_folder="$(find "$NAVIDROME_MUSIC_FOLDER" -type f \( -iname "*.mp3" -o -iname "*.flac" -o -iname "*.m4a" -o -iname "*.ogg" -o -iname "*.wav" \) -print -quit 2>/dev/null || true)"
  [[ -z "$audio_in_folder" ]] || return 0

  parent="$(dirname "$NAVIDROME_MUSIC_FOLDER")"
  [[ "$parent" != "$NAVIDROME_MUSIC_FOLDER" && -d "$parent" ]] || return 0
  audio_in_parent="$(find "$parent" -maxdepth 3 -type f \( -iname "*.mp3" -o -iname "*.flac" -o -iname "*.m4a" -o -iname "*.ogg" -o -iname "*.wav" \) -print -quit 2>/dev/null || true)"

  if [[ -n "$audio_in_parent" ]]; then
    echo "Warning: Music folder has no audio files: $NAVIDROME_MUSIC_FOLDER"
    echo "         The parent folder does contain audio files: $parent"
    echo "         If this is an SMB/disk mount, check that NAVIDROME_MUSIC_FOLDER points at the real library root."
  fi
}

navidrome_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf '%s\n' "amd64" ;;
    aarch64|arm64) printf '%s\n' "arm64" ;;
    armv7l|armv7) printf '%s\n' "armv7" ;;
    *)
      die "Unsupported CPU architecture for Navidrome install: $(uname -m)"
      ;;
  esac
}

navidrome_release_json() {
  curl -fsSL -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/navidrome/navidrome/releases/latest"
}

resolve_navidrome_download_url() {
  local arch="$1"
  local version="$NAVIDROME_VERSION"
  local version_no_v json asset_url

  if [[ "$version" == "latest" ]]; then
    json="$(navidrome_release_json)"
    version="$(printf '%s\n' "$json" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
    asset_url="$(printf '%s\n' "$json" | grep -o "https://[^\"]*navidrome_[^\"]*_linux_${arch}\\.tar\\.gz" | head -n1)"
    [[ -n "$version" ]] || die "Unable to resolve latest Navidrome version from GitHub."
    [[ -n "$asset_url" ]] || die "Unable to find a Navidrome Linux ${arch} release asset."
    NAVIDROME_RESOLVED_VERSION="$version"
    printf '%s\n' "$asset_url"
    return 0
  fi

  version_no_v="${version#v}"
  NAVIDROME_RESOLVED_VERSION="v${version_no_v}"
  printf 'https://github.com/navidrome/navidrome/releases/download/v%s/navidrome_%s_linux_%s.tar.gz\n' \
    "$version_no_v" "$version_no_v" "$arch"
}

ensure_navidrome_account() {
  local nologin_shell
  nologin_shell="$(command -v nologin || true)"
  if [[ -z "$nologin_shell" ]]; then
    nologin_shell="/sbin/nologin"
  fi

  if ! getent group "$NAVIDROME_GROUP" >/dev/null 2>&1; then
    run groupadd --system "$NAVIDROME_GROUP"
  fi

  if ! id -u "$NAVIDROME_USER" >/dev/null 2>&1; then
    run useradd \
      --system \
      --home-dir "$NAVIDROME_DATA_FOLDER" \
      --shell "$nologin_shell" \
      --gid "$NAVIDROME_GROUP" \
      "$NAVIDROME_USER"
  fi

  if [[ -n "$UPLOAD_USER" ]] && id -u "$UPLOAD_USER" >/dev/null 2>&1; then
    run usermod -a -G "$NAVIDROME_GROUP" "$UPLOAD_USER"
  fi
}

install_navidrome_files() {
  local arch download_url temp_dir archive

  arch="$(navidrome_arch)"
  download_url="$(resolve_navidrome_download_url "$arch")"
  temp_dir="$(mktemp -d)"
  archive="$temp_dir/navidrome.tar.gz"

  echo "[3/7] Installing Navidrome ${NAVIDROME_RESOLVED_VERSION:-$NAVIDROME_VERSION}..."

  ensure_navidrome_account

  run install -d -m 755 -o "$NAVIDROME_USER" -g "$NAVIDROME_GROUP" "$NAVIDROME_INSTALL_ROOT"
  run install -d -m 755 -o "$NAVIDROME_USER" -g "$NAVIDROME_GROUP" "$NAVIDROME_BIN_DIR"
  run install -d -m 775 -o "$NAVIDROME_USER" -g "$NAVIDROME_GROUP" "$NAVIDROME_MUSIC_FOLDER"
  run install -d -m 755 -o "$NAVIDROME_USER" -g "$NAVIDROME_GROUP" "$NAVIDROME_DATA_FOLDER"
  run chmod 2775 "$NAVIDROME_MUSIC_FOLDER"
  run install -d -m 755 /etc/navidrome

  curl -fsSL "$download_url" -o "$archive"
  tar -xzf "$archive" -C "$temp_dir"
  run install -m 755 "$temp_dir/navidrome" "$NAVIDROME_BIN_DIR/navidrome"
  printf '%s\n' "${NAVIDROME_RESOLVED_VERSION:-$NAVIDROME_VERSION}" | run tee "$NAVIDROME_BIN_DIR/.navidrome-version" >/dev/null

  rm -rf "$temp_dir"
}

write_navidrome_config() {
  run tee "$NAVIDROME_CONFIG_FILE" >/dev/null <<EOF
Address = "$NAVIDROME_HOST"
Port = $NAVIDROME_PORT
MusicFolder = "$NAVIDROME_MUSIC_FOLDER"
DataFolder = "$NAVIDROME_DATA_FOLDER"
ScanSchedule = "$NAVIDROME_SCAN_SCHEDULE"
LogLevel = "INFO"
EOF
}

write_navidrome_unit() {
  if [[ "$SKIP_SYSTEMD" == true ]]; then
    echo "[4/7] Skipping Navidrome systemd setup (--skip-systemd)"
    return 0
  fi

  echo "[4/7] Installing Navidrome systemd service: $NAVIDROME_SERVICE_NAME"
  run install -d -m 755 /etc/systemd/system
  run tee "$NAVIDROME_UNIT_PATH" >/dev/null <<EOF
[Unit]
Description=Navidrome Music Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$NAVIDROME_USER
Group=$NAVIDROME_GROUP
WorkingDirectory=$NAVIDROME_DATA_FOLDER
ExecStart=$NAVIDROME_BIN_DIR/navidrome --configfile "$NAVIDROME_CONFIG_FILE"
Restart=on-failure
RestartSec=5
PrivateTmp=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF
  run systemctl daemon-reload
  run systemctl enable --now "$NAVIDROME_SERVICE_NAME"
}

install_navidrome() {
  if [[ "$INSTALL_NAVIDROME" != "true" ]]; then
    echo "[3/7] Skipping Navidrome install (--skip-navidrome / INSTALL_NAVIDROME=false)"
    echo "[4/7] Skipping Navidrome systemd setup"
    return 0
  fi

  cleanup_conflicting_docker_navidrome
  install_navidrome_files
  warn_if_music_folder_looks_empty
  write_navidrome_config
  write_navidrome_unit
}

write_frontend_unit() {
  local extra_after=""
  local extra_wants=""

  if [[ "$SKIP_SYSTEMD" == true ]]; then
    echo "[5/7] Skipping systemd setup (--skip-systemd)"
    return 0
  fi

  if [[ "$INSTALL_NAVIDROME" == "true" ]]; then
    extra_after="After=${NAVIDROME_SERVICE_NAME}.service"
    extra_wants="Wants=${NAVIDROME_SERVICE_NAME}.service"
  fi

  echo "[5/7] Installing systemd service: $SERVICE_NAME"
  run install -d -m 755 /etc/systemd/system
  run tee "$APP_UNIT_PATH" >/dev/null <<EOF
[Unit]
Description=NaviGlassPlayer front end
After=network-online.target
Wants=network-online.target
${extra_after}
${extra_wants}

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=HOST=$APP_HOST
Environment=PORT=$APP_PORT
Environment=NAVIDROME_ORIGIN=$NAVIDROME_ORIGIN
ExecStart=/usr/bin/env node server.mjs
Restart=on-failure
RestartSec=5
PrivateTmp=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF
  run systemctl daemon-reload
  run systemctl enable --now "$SERVICE_NAME"
}

configure_firewall() {
  if [[ "$SKIP_INSTALL" == true || "$SKIP_FIREWALL" == true ]]; then
    echo "[6/7] Skipping firewalld setup"
    return 0
  fi

  echo "[6/7] Opening app port $FIREWALL_PORT/tcp in firewalld..."
  run firewall-cmd --permanent --add-port="${FIREWALL_PORT}/tcp"

  if [[ "$INSTALL_NAVIDROME" == "true" ]]; then
    echo "[6/7] Opening Navidrome port $NAVIDROME_PORT/tcp in firewalld..."
    run firewall-cmd --permanent --add-port="${NAVIDROME_PORT}/tcp"
  fi

  run firewall-cmd --reload
}

verify_deploy() {
  echo "[7/7] Verifying deployment..."

  if [[ "$SKIP_SYSTEMD" == true ]]; then
    echo
    echo "Deployment files written."
    echo "  systemd setup:     skipped"
    echo "  Navidrome source:  $DEFAULT_NAVIDROME_GIT_URL"
    echo "  Repo checkout:     $REPO_ROOT"
    echo "  App directory:     $APP_DIR"
    echo "  Navidrome target:  $NAVIDROME_ORIGIN"
    echo "  App port:          $APP_PORT"
    return 0
  fi

  if [[ "$SKIP_SYSTEMD" == false ]]; then
    if [[ "$INSTALL_NAVIDROME" == "true" ]]; then
      run systemctl is-active --quiet "$NAVIDROME_SERVICE_NAME"
    fi
    run systemctl is-active --quiet "$SERVICE_NAME"
  fi

  if [[ "$INSTALL_NAVIDROME" == "true" ]]; then
    curl -fsS -o /dev/null "http://127.0.0.1:${NAVIDROME_PORT}/"
  fi
  curl -fsS -o /dev/null "http://127.0.0.1:${APP_PORT}/"

  echo
  echo "Deployment complete."
  echo "  Navidrome source:  $DEFAULT_NAVIDROME_GIT_URL"
  if [[ "$INSTALL_NAVIDROME" == "true" ]]; then
    echo "  Navidrome version: ${NAVIDROME_RESOLVED_VERSION:-$NAVIDROME_VERSION}"
    echo "  Navidrome service: $NAVIDROME_SERVICE_NAME"
    echo "  Navidrome URL:     http://$(hostname -I 2>/dev/null | awk '{print $1}'):${NAVIDROME_PORT}"
    echo "  Music folder:      $NAVIDROME_MUSIC_FOLDER"
    echo "  Data folder:       $NAVIDROME_DATA_FOLDER"
  else
    echo "  Navidrome target:  $NAVIDROME_ORIGIN"
  fi
  echo "  App variant:       $APP_VARIANT"
  echo "  Repo checkout:     $REPO_ROOT"
  echo "  App directory:     $APP_DIR"
  echo "  Service name:      $SERVICE_NAME"
  echo "  App URL:           http://$(hostname -I 2>/dev/null | awk '{print $1}'):${APP_PORT}"
  echo "  Local check URL:   http://127.0.0.1:${APP_PORT}"
  echo "  Logs:              sudo journalctl -u $SERVICE_NAME -f"
}

install_packages
prepare_checkout
install_navidrome
write_frontend_unit
configure_firewall
verify_deploy
