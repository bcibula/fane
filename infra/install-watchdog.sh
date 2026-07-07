#!/bin/bash
# Installs the Fane IB Gateway watchdog.
# Run once with sudo: sudo bash ~/fane/infra/install-watchdog.sh

set -e

INFRA_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing fane-gateway-watchdog..."

cp "$INFRA_DIR/fane-gateway-watchdog.sh" /usr/local/bin/fane-gateway-watchdog.sh
chmod +x /usr/local/bin/fane-gateway-watchdog.sh

cp "$INFRA_DIR/fane-gateway-watchdog.service" /etc/systemd/system/fane-gateway-watchdog.service
cp "$INFRA_DIR/fane-gateway-watchdog.timer" /etc/systemd/system/fane-gateway-watchdog.timer

systemctl daemon-reload
systemctl enable --now fane-gateway-watchdog.timer

echo "Done. Timer status:"
systemctl status fane-gateway-watchdog.timer --no-pager
echo ""
echo "Next fire:"
systemctl list-timers fane-gateway-watchdog.timer --no-pager
