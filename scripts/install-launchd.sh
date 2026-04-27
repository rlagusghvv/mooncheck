#!/bin/zsh
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/mooncheck}"
PORT="${PORT:-3000}"
PLIST="$HOME/Library/LaunchAgents/com.mooncheck.web.plist"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.mooncheck.web</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "$APP_DIR" &amp;&amp; PORT=$PORT npm run start:public</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/mooncheck.out.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/mooncheck.err.log</string>
  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/com.mooncheck.web"

echo "mooncheck launchd service installed: $PLIST"
echo "APP_DIR=$APP_DIR PORT=$PORT"
