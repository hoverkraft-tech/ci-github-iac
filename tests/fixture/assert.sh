#!/usr/bin/env bash
set -euo pipefail

# The guest supplies its distribution metadata.
# shellcheck source=/dev/null
. /etc/os-release
test "$ID" = ubuntu
test -d /run/systemd/system
test ! -e /tmp/iac-fixture
printf '%s' synthetic >/tmp/iac-fixture
test "$(cat /tmp/iac-fixture)" = synthetic
rm /tmp/iac-fixture

if [[ -n ${REPORTS_DIR:-} ]]; then
	cat >"$REPORTS_DIR/junit.xml" <<'XML'
<testsuite name="guest-fixture" tests="1" failures="0"><testcase name="cold-boot"/></testsuite>
XML
	mkdir "$REPORTS_DIR/coverage"
	printf 'TN:fixture\nSF:tests/fixture/assert.sh\nDA:1,1\nend_of_record\n' >"$REPORTS_DIR/coverage/lcov.info"
	printf 'synthetic-private-output\n' >"$REPORTS_DIR/private.txt"
	ln -s "$REPORTS_DIR/private.txt" "$REPORTS_DIR/linked.xml"
fi
