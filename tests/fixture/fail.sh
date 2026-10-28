#!/usr/bin/env bash
set -euo pipefail

# Synthetic output must never reach the public report.
printf '%s\n' 'synthetic-private-output'
if [[ -n ${REPORTS_DIR:-} ]]; then
	cat >"$REPORTS_DIR/junit.xml" <<'XML'
<testsuite name="guest-fixture" tests="1" failures="1">
<testcase name="deliberate-failure" file="/guest/project/tests/fixture/fail.sh">
<failure message="Synthetic assertion failure"/></testcase></testsuite>
XML
fi
exit 1
