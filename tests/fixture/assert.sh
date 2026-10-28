#!/usr/bin/env bash
set -euo pipefail

test "$(. /etc/os-release && printf '%s' "$ID")" = ubuntu
test -d /run/systemd/system
test ! -e /tmp/iac-fixture
printf '%s' synthetic >/tmp/iac-fixture
test "$(cat /tmp/iac-fixture)" = synthetic
rm /tmp/iac-fixture
