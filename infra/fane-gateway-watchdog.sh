#!/bin/bash
# Fane IB Gateway watchdog.
# Checks if IB Gateway is listening on port 4002.
# Restarts ibgateway.service if not. Logs only on action.

LOGFILE="/var/log/fane-watchdog.log"
PORT=4002

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

if ! ss -tlnp | grep -q ":${PORT}"; then
  echo "$(timestamp) [watchdog] Port ${PORT} not listening. Restarting ibgateway.service." >> "$LOGFILE"
  systemctl restart ibgateway.service
  echo "$(timestamp) [watchdog] Restart issued." >> "$LOGFILE"
fi
