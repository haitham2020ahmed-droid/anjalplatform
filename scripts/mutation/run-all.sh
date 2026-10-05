#!/bin/sh
# Mutation check: each script deliberately breaks safeguards one at a time, runs the
# relevant tests, restores the file, and prints CAUGHT or MISSED. Any MISSED line means
# a safeguard is no longer protected by a test. Run from the project root:
#   sh scripts/mutation/run-all.sh
set -e
for f in scripts/mutation/phase*.py; do echo "== $f"; python3 "$f"; done
