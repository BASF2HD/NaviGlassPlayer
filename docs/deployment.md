# Deployment

This repo ships two one-shot deployment helpers for clean Linux servers:

- [scripts/deploy-rocky.sh](../scripts/deploy-rocky.sh)
- [scripts/deploy-ubuntu.sh](../scripts/deploy-ubuntu.sh)
- [scripts/deploy-synology.sh](../scripts/deploy-synology.sh)
- [scripts/deploy-raspberry-pi.sh](../scripts/deploy-raspberry-pi.sh)

They are modeled after the `slims-analytics` fresh-install flow:

- install OS packages
- install Navidrome and `ffmpeg`
- optionally clone/update the repo
- clean up a conflicting Docker Navidrome container when installing the native service
- register `systemd` services
- open the app ports in the host firewall
- install bundled `.nsp` smart playlist templates

The default path is now a full local stack:

1. install Navidrome first
2. configure Navidrome with local music/data folders
3. install the NaviGlassPlayer client from the repo root
4. point the client at the local Navidrome on `127.0.0.1:4533`

For long-term use on a private tailnet, harden the install after bootstrap with
Tailscale Serve:

```text
https://<machine>.<tailnet>.ts.net/          -> NaviGlassPlayer client
https://<machine>.<tailnet>.ts.net/navidrome/ -> Navidrome UI
```

In that mode both local services listen only on `127.0.0.1`, and no direct
Navidrome or client port is exposed to the LAN or router.

If the repo is private, install a read-only deploy key on the server and place
the private key at `~/.ssh/naviglassplayer_deploy`. Both deploy helpers use that path
by default when `APP_GIT_URL` is an SSH GitHub URL.

## Defaults

- Default app variant: `naviglassplayer`
- Default service name: `naviglassplayer`
- Default app port: `8787`
- Default bind host: `0.0.0.0`
- Default Navidrome target: `http://127.0.0.1:4533`
- Default Navidrome service name: `navidrome`
- Default Navidrome port: `4533`
- Default music folder: `/opt/navidrome/music`
- Default Navidrome data folder: `/var/lib/navidrome`
- Default Navidrome config file: `/etc/navidrome/navidrome.toml`
- Default Navidrome source project: [navidrome/navidrome](https://github.com/navidrome/navidrome)
- Default Docker cleanup mode: `CLEANUP_DOCKER_NAVIDROME=true`

The defaults above expose `4533` and `8787` during bootstrap. The recommended
private HTTPS posture below changes the bind addresses to `127.0.0.1`, removes
direct firewall rules for those ports, and uses Tailscale Serve on HTTPS `443`.

## Rocky Linux

From a fresh server checkout:

```bash
git clone https://github.com/BASF2HD/NaviGlassPlayer.git ~/NaviGlassPlayer
cd ~/NaviGlassPlayer
bash scripts/deploy-rocky.sh --auto --music-folder /mnt/music --upload-user "$USER"
```

For a true one-shot bootstrap on a fresh Rocky box with a private repo:

```bash
APP_GIT_SSH_KEY_PATH=~/.ssh/naviglassplayer_deploy \
bash deploy-rocky.sh --clone ~/NaviGlassPlayer --auto
```

If you only copied the script to the server:

```bash
APP_GIT_URL=https://github.com/BASF2HD/NaviGlassPlayer.git \
bash deploy-rocky.sh --clone ~/NaviGlassPlayer --auto
```

What it installs:

- `git`
- `curl`
- `firewalld`
- Node.js 20 LTS
- `ffmpeg`
- Navidrome from the latest upstream Linux release tarball

What it configures:

- Navidrome `systemd` service
- `systemd` service for the selected app
- local Navidrome config at `/etc/navidrome/navidrome.toml`
- `firewalld` rule for the app port
- `firewalld` rule for port `4533`
- cleanup of a conflicting Docker Navidrome container on port `4533`

After the first deploy, use the Tailscale Serve hardening section if the host
should be reachable only through private HTTPS.

## Ubuntu

From a fresh server checkout:

```bash
git clone https://github.com/BASF2HD/NaviGlassPlayer.git ~/NaviGlassPlayer
cd ~/NaviGlassPlayer
bash scripts/deploy-ubuntu.sh --auto --music-folder /mnt/music --upload-user "$USER"
```

For a true one-shot bootstrap on a fresh Ubuntu box with a private repo:

```bash
APP_GIT_SSH_KEY_PATH=~/.ssh/naviglassplayer_deploy \
bash deploy-ubuntu.sh --clone ~/NaviGlassPlayer --auto
```

If you only copied the script to the server:

```bash
APP_GIT_URL=https://github.com/BASF2HD/NaviGlassPlayer.git \
bash deploy-ubuntu.sh --clone ~/NaviGlassPlayer --auto
```

What it installs:

- `git`
- `curl`
- `ufw`
- Node.js 20 LTS
- `ffmpeg`
- Navidrome from the latest upstream Linux release tarball

What it configures:

- Navidrome `systemd` service
- `systemd` service for the selected app
- local Navidrome config at `/etc/navidrome/navidrome.toml`
- `ufw` rule for the app port
- `ufw` rule for port `4533`
- `OpenSSH` allowance before enabling `ufw`
- cleanup of a conflicting Docker Navidrome container on port `4533`

After the first deploy, use the Tailscale Serve hardening section if the host
should be reachable only through private HTTPS.

## Synology DSM 7 ARM64

Use this for a Synology NAS such as DS118/ARM64 where Container Manager is not
available or when you want a native install.

```bash
git clone https://github.com/BASF2HD/NaviGlassPlayer.git ~/NaviGlassPlayer
cd ~/NaviGlassPlayer
RUN_USER="$USER" MUSIC_FOLDER="/volume1/Music" sh scripts/deploy-synology.sh
```

What it installs:

- Navidrome ARM64 from the official upstream release tarball
- Node.js 22 ARM64 under `/volume1/@appdata/node`
- NaviGlassPlayer under `/volume1/@appdata/naviglassplayer`
- Navidrome data/config under `/volume1/@appdata/navidrome`
- `navidrome.service` and `naviglassplayer.service`
- bundled smart playlist `.nsp` files under `/volume1/Music/Smart Playlists`

Optional Tailscale install and Serve setup:

```bash
INSTALL_TAILSCALE=true \
TAILSCALE_HOSTNAME=synology-music \
TAILSCALE_DOMAIN=<tailnet>.ts.net \
RUN_USER="$USER" \
MUSIC_FOLDER="/volume1/Music" \
sh scripts/deploy-synology.sh
```

After Tailscale authentication, expected URLs are:

```text
https://<machine>.<tailnet>.ts.net/          -> NaviGlassPlayer
https://<machine>.<tailnet>.ts.net/navidrome/ -> Navidrome
```

Synology notes:

- The script expects DSM 7, `systemd`, `/usr/bin/ffmpeg`, `curl`, and `tar`.
- If SSH users have no home directory, that warning is harmless.
- If normal `scp` is disabled, copy files using SSH stdin or clone the repo from
  the NAS shell.
- The first Navidrome scan can take a long time on ARM NAS hardware; smart
  playlists appear after the scanner refreshes playlists.

## Raspberry Pi OS

Use this for Raspberry Pi OS or Debian/Ubuntu on ARM. It supports `arm64`,
`armv7`, and `amd64` by selecting the matching Navidrome release tarball.

```bash
git clone https://github.com/BASF2HD/NaviGlassPlayer.git ~/NaviGlassPlayer
cd ~/NaviGlassPlayer
MUSIC_FOLDER="/mnt/music" bash scripts/deploy-raspberry-pi.sh
```

What it installs:

- `curl`, `git`, `ffmpeg`, and Node.js 22 from NodeSource if Node is missing
- Navidrome from the official upstream release tarball
- `navidrome.service` and `naviglassplayer.service`
- bundled smart playlist `.nsp` files under `$MUSIC_FOLDER/Smart Playlists`

Optional Tailscale install and Serve setup:

```bash
INSTALL_TAILSCALE=true \
TAILSCALE_HOSTNAME=raspberrypi-music \
TAILSCALE_DOMAIN=<tailnet>.ts.net \
MUSIC_FOLDER="/mnt/music" \
bash scripts/deploy-raspberry-pi.sh
```

Expected URLs after Tailscale authentication:

```text
https://<machine>.<tailnet>.ts.net/          -> NaviGlassPlayer
https://<machine>.<tailnet>.ts.net/navidrome/ -> Navidrome
```

## Common Options

- `--auto`
  Creates a deploy env file if one does not already exist.
- `--env-file /path/to/file`
  Loads a specific deploy env file.
- `--app naviglassplayer`
  Deploys the top-level NaviGlassPlayer client. This is the default.
- `--port PORT`
  Overrides the default `8787` service port when a custom port is required.
- `--skip-navidrome`
  Skips the local Navidrome install and uses `NAVIDROME_ORIGIN` as an external backend.
- `--cleanup-docker-navidrome`
  Stops and removes an existing Docker Navidrome container before installing the native `systemd` service. This is the default.
- `--keep-docker-navidrome`
  Leaves an existing Docker Navidrome container alone. Use this only with `--skip-navidrome` or when you intentionally run Docker on a different port.
- `--navidrome-origin http://192.168.1.202:4533`
  Points the front end at an existing Navidrome server that is reachable from the target machine.
- `--navidrome-port 4533`
  Overrides the local Navidrome port used by the bootstrap.
- `--navidrome-host 0.0.0.0`
  Overrides the local Navidrome bind address.
- `--navidrome-version latest`
  Installs the latest Navidrome release, or a specific release tag like `v0.58.5`.
- `--music-folder /srv/music`
  Overrides the local Navidrome music library folder.
- `--data-folder /srv/navidrome-data`
  Overrides the local Navidrome data directory.
- `--upload-user ctc-lims`
  Adds that user to the `navidrome` group so SFTP uploads can write to the music folder.
- `--install-dir ~/NaviGlassPlayer`
  Overrides the checkout path used by the script.
- `--skip-install`
  Skips OS package installation.
- `--skip-firewall`
  Skips firewall configuration.
- `--skip-systemd`
  Skips service installation.
- `--print-env-template`
  Prints an example env file.

## Deploy Env Files

The scripts use these env files by default:

- `deploy-rocky.env`
- `deploy-ubuntu.env`

Typical values:

```bash
APP_GIT_URL=https://github.com/BASF2HD/NaviGlassPlayer.git
INSTALL_DIR=/home/your-user/NaviGlassPlayer
APP_VARIANT=naviglassplayer
APP_HOST=0.0.0.0
APP_PORT=8787
INSTALL_NAVIDROME=true
NAVIDROME_ORIGIN=http://127.0.0.1:4533
NAVIDROME_HOST=0.0.0.0
NAVIDROME_PORT=4533
NAVIDROME_SERVICE_NAME=navidrome
NAVIDROME_VERSION=latest
NAVIDROME_USER=navidrome
NAVIDROME_GROUP=navidrome
NAVIDROME_BIN_DIR=/opt/navidrome/bin
NAVIDROME_MUSIC_FOLDER=/opt/navidrome/music
NAVIDROME_DATA_FOLDER=/var/lib/navidrome
NAVIDROME_CONFIG_FILE=/etc/navidrome/navidrome.toml
NAVIDROME_SCAN_SCHEDULE=@every 5m
CLEANUP_DOCKER_NAVIDROME=true
UPLOAD_USER=your-user
SERVICE_NAME=naviglassplayer
FIREWALL_PORT=8787
APP_GIT_SSH_KEY_PATH=
```

## Private HTTPS With Tailscale Serve

Use this mode when the server should be private to Tailscale, with a clean HTTPS
URL for tablet browsers and no router port forwarding.

Prerequisites:

- Tailscale is installed and connected on the server.
- MagicDNS is enabled for the tailnet.
- HTTPS certificates are enabled in the Tailscale admin console DNS page.
- The tablet/browser device is connected to the same tailnet.

Official Tailscale references:

- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
- [tailscale serve command](https://tailscale.com/kb/1242/tailscale-serve)
- [MagicDNS](https://tailscale.com/docs/features/magicdns/)
- [HTTPS certificates](https://tailscale.com/docs/how-to/set-up-https-certificates)

### Inspect First

Run these before changing a server:

```bash
cat /etc/os-release
tailscale version
tailscale status
tailscale dns status
tailscale serve status
systemctl status navidrome --no-pager -l
systemctl status naviglassplayer --no-pager -l
ss -ltnp | grep -E ':(443|4533|8787)'
sudo ufw status verbose || true
sudo firewall-cmd --state && sudo firewall-cmd --list-all || true
```

Check the current MagicDNS name:

```bash
tailscale status --json | python3 -c 'import json,sys; s=json.load(sys.stdin)["Self"]; print(s["DNSName"]); print(s["TailscaleIPs"])'
```

### Configure The Server Name

Pick a short Tailscale machine name, for example:

```text
music-server.<tailnet>.ts.net
```

Set it on the target server:

```bash
sudo tailscale set --hostname=<machine>
```

Use a unique name for each server.

### Bind Services To Localhost

Back up the files first:

```bash
sudo cp /etc/navidrome/navidrome.toml /etc/navidrome/navidrome.toml.bak-tailscale-serve-$(date +%Y%m%d%H%M%S)
sudo cp /etc/systemd/system/naviglassplayer.service /etc/systemd/system/naviglassplayer.service.bak-tailscale-serve-$(date +%Y%m%d%H%M%S)
```

Configure Navidrome for `/navidrome` and localhost-only access:

```bash
sudo sed -i 's/^Address = .*/Address = "127.0.0.1"/' /etc/navidrome/navidrome.toml
if sudo grep -q '^[[:space:]]*BaseUrl[[:space:]]*=' /etc/navidrome/navidrome.toml; then
  sudo sed -i 's|^[[:space:]]*BaseUrl[[:space:]]*=.*|BaseUrl = "/navidrome"|' /etc/navidrome/navidrome.toml
else
  printf 'BaseUrl = "/navidrome"\n' | sudo tee -a /etc/navidrome/navidrome.toml >/dev/null
fi
```

Bind the NaviGlassPlayer client to localhost:

```bash
sudo sed -i 's/^Environment=HOST=.*/Environment=HOST=127.0.0.1/' /etc/systemd/system/naviglassplayer.service
sudo systemctl daemon-reload
sudo systemctl restart navidrome naviglassplayer
```

### Configure Tailscale Serve

Serve root `/` as the NaviGlassPlayer client and `/navidrome` as original Navidrome:

```bash
sudo tailscale serve reset
sudo tailscale serve --bg --https=443 http://127.0.0.1:8787
sudo tailscale serve --bg --https=443 --set-path=/navidrome http://127.0.0.1:4533/navidrome
tailscale serve status
```

The expected shape is:

```text
https://<machine>.<tailnet>.ts.net (tailnet only)
|-- /          proxy http://127.0.0.1:8787
|-- /navidrome proxy http://127.0.0.1:4533/navidrome
```

The `--bg` flag makes Serve persistent across reboot and Tailscale restarts.

### Close Direct Ports

After HTTPS works, remove direct firewall access to the raw ports:

```bash
sudo ufw --force delete allow 4533/tcp || true
sudo ufw --force delete allow 8787/tcp || true
sudo ufw status verbose
```

For `firewalld` hosts:

```bash
sudo firewall-cmd --permanent --remove-port=4533/tcp || true
sudo firewall-cmd --permanent --remove-port=8787/tcp || true
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

### Verify

On the server:

```bash
ss -ltnp | grep -E ':(443|4533|8787)'
curl -fsS -o /dev/null -w 'naviglassplayer HTTPS HTTP:%{http_code}\n' https://<machine>.<tailnet>.ts.net/
curl -fsS -o /dev/null -w 'navidrome HTTPS HTTP:%{http_code}\n' https://<machine>.<tailnet>.ts.net/navidrome/app/
curl -sS -o /dev/null -w 'direct 8787 HTTP:%{http_code}\n' --connect-timeout 5 http://100.x.y.z:8787/ || true
curl -sS -o /dev/null -w 'direct 4533 HTTP:%{http_code}\n' --connect-timeout 5 http://100.x.y.z:4533/ || true
```

Expected:

- `127.0.0.1:4533` is listening.
- `127.0.0.1:8787` is listening.
- Tailscale HTTPS returns `HTTP:200`.
- direct `http://100.x.y.z:4533` and `http://100.x.y.z:8787` do not connect.

From a tablet/browser with Tailscale connected:

```text
https://<machine>.<tailnet>.ts.net/
https://<machine>.<tailnet>.ts.net/navidrome/
```

### Rollback

Disable Tailscale Serve:

```bash
sudo tailscale serve reset
```

Restore direct LAN/tailnet IP access:

```bash
sudo sed -i 's/^Address = .*/Address = "0.0.0.0"/' /etc/navidrome/navidrome.toml
sudo sed -i '/^[[:space:]]*BaseUrl[[:space:]]*=/d' /etc/navidrome/navidrome.toml
sudo sed -i 's/^Environment=HOST=.*/Environment=HOST=0.0.0.0/' /etc/systemd/system/naviglassplayer.service
sudo systemctl daemon-reload
sudo systemctl restart navidrome naviglassplayer
sudo ufw allow 4533/tcp || true
sudo ufw allow 8787/tcp || true
```

For `firewalld` hosts:

```bash
sudo firewall-cmd --permanent --add-port=4533/tcp
sudo firewall-cmd --permanent --add-port=8787/tcp
sudo firewall-cmd --reload
```

## Cleaning Up An Existing Docker Install

The deploy scripts install Navidrome as a native `systemd` service. If an older Docker or Docker Compose Navidrome is already bound to port `4533`, the native service cannot start cleanly.

By default, both scripts look for Docker containers named `navidrome` or publishing the selected Navidrome port. When found, they:

- stop the Docker Compose stack if `/opt/navidrome/docker-compose.yml` exists
- rename the Compose file to a timestamped `.disabled-*` backup
- remove the conflicting container
- preserve host data folders such as `/opt/navidrome/data` and any mounted music folders

To keep Docker running instead, skip the local install and point the front end at it:

```bash
bash scripts/deploy-ubuntu.sh \
  --auto \
  --skip-navidrome \
  --navidrome-origin http://127.0.0.1:4533
```

Use the Rocky script name on Rocky Linux.

## Music Folder Checks

For mounted disks or SMB shares, point Navidrome at the actual library root, not an empty child folder. A common mistake is:

```yaml
/mnt/music/Music:/music:ro
```

when the albums are really under:

```text
/mnt/music
```

The correct Docker-style mount would be:

```yaml
/mnt/music:/music:ro
```

For the native scripts, use:

```bash
bash scripts/deploy-ubuntu.sh --auto --music-folder /mnt/music
```

The scripts warn if the selected music folder has no audio files but its parent folder does. After deploy, these checks should agree:

```bash
sudo -u navidrome find /mnt/music -type f \( -iname "*.mp3" -o -iname "*.flac" -o -iname "*.m4a" -o -iname "*.ogg" -o -iname "*.wav" \) | head
sudo journalctl -u navidrome -n 80 --no-pager
```

## External Music Disk

To use an already formatted external disk without erasing it:

```bash
lsblk -f
sudo mkdir -p /mnt/music
sudo mount /dev/sdX1 /mnt/music
sudo blkid /dev/sdX1
```

Then add the disk UUID to `/etc/fstab`:

```text
UUID=your-disk-uuid /mnt/music auto defaults,nofail 0 2
```

Set permissions so Navidrome can scan and your SSH user can upload:

```bash
sudo chown -R navidrome:navidrome /mnt/music
sudo chmod 2775 /mnt/music
sudo usermod -a -G navidrome "$USER"
```

Log out and back in after adding your user to the `navidrome` group.

## Uploading Music From Mac

Fast SSH upload over Tailscale:

```bash
rsync -ah --whole-file --info=progress2 -e "ssh -T -c aes128-gcm@openssh.com -o Compression=no" "/path/to/Music/" your-user@tailscale-ip:/mnt/music/
```

Finder SMB works too, but it is often slower over Tailscale. Use Finder > Go > Connect to Server:

```text
smb://tailscale-ip/Music
```

## After Deploy

Useful commands:

```bash
sudo systemctl status navidrome
sudo journalctl -u navidrome -f
sudo systemctl status naviglassplayer
sudo journalctl -u naviglassplayer -f
curl -I http://127.0.0.1:4533/
curl -I http://127.0.0.1:8787/
```

Navidrome may reject `HEAD` requests with `405 Method Not Allowed`; use a normal GET-style check if needed:

```bash
curl -fsS -o /dev/null http://127.0.0.1:4533/
curl -fsS -o /dev/null http://127.0.0.1:8787/
```

If you override the app service name or port, use the values printed by the script.

## External Navidrome Mode

If you already run Navidrome elsewhere and only want the client on this host:

```bash
bash scripts/deploy-rocky.sh \
  --auto \
  --skip-navidrome \
  --navidrome-origin http://your-navidrome-host:4533
```

```bash
bash scripts/deploy-ubuntu.sh \
  --auto \
  --skip-navidrome \
  --navidrome-origin http://your-navidrome-host:4533
```
