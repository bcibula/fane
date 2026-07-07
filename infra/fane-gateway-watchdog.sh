#!/bin/bash
# Fane IB Gateway watchdog.
# Checks if IB Gateway is listening on port 4002.
# Restarts ibgateway.service if not.
# Logs and sends Telegram notification only on action.

LOGFILE="/var/log/fane-watchdog.log"
PORT=4002
ENV_FILE="/home/brad/fane/.env"

timestamp() {
  TZ="America/Toronto" date +"%Y-%m-%d %-I:%M%P"
}

send_telegram() {
  local message="$1"
  local token chat_id
  token=$(grep "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" | cut -d'=' -f2)
  chat_id=$(grep "^TELEGRAM_CHAT_ID=" "$ENV_FILE" | cut -d'=' -f2)
  curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" \
    -d chat_id="${chat_id}" \
    -d text="${message}" > /dev/null
}

if ! ss -tlnp | grep -q ":${PORT}"; then
  TS=$(timestamp)
  echo "${TS} [watchdog] Port ${PORT} not listening. Restarting ibgateway.service." >> "$LOGFILE"

  if systemctl restart ibgateway.service; then
    echo "${TS} [watchdog] Restart succeeded." >> "$LOGFILE"
    send_telegram "🟡 Fane watchdog: ibgateway was down, restarted successfully at ${TS}."
  else
    echo "${TS} [watchdog] Restart FAILED." >> "$LOGFILE"
    send_telegram "🔴 Fane watchdog: ibgateway was down and restart FAILED at ${TS}. Manual intervention required."
  fi
fi
