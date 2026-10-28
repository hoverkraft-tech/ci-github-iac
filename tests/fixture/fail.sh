#!/usr/bin/env bash
set -euo pipefail

# Synthetic output must never reach the public report.
printf '%s\n' 'synthetic-private-output'
exit 1
