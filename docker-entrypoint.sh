#!/bin/sh
# Mounted volumes (Render disks, Docker volumes) are often root-owned: fix ownership of the
# data directory, then drop privileges and run the server as the unprivileged "node" user.
set -e
mkdir -p "$DATA_DIR"
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
