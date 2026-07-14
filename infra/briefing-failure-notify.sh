#!/bin/bash
# Fane briefing failure notifier.
# Triggered via OnFailure= from fane-briefing.service.
# Sends a Telegram notification when run-briefing.js fails.

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

TS=$(timestamp)
send_telegram "🔴 Fane briefing: run-briefing.js failed at ${TS}. Check journalctl -u fane-briefing.service."
