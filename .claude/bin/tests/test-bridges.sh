#!/usr/bin/env bash
#
# test-bridges.sh — standalone tests for the fleet bridge scripts.
#
#   .claude/bin/tests/test-bridges.sh
#
# No framework, no npm wiring (the app suite stays app-only). Runs against the
# FAKE `agy` and `codex` shims in ./shims, so it costs nothing and needs no
# auth. Prints PASS/FAIL per assertion and exits non-zero if any test fails.
#
# What it locks down:
#   - prompts travel by file/stdin, never through argv or shell interpolation
#   - stdout carries the answer and nothing else; stderr noise never leaks in
#   - every failure mode of the agy JSON envelope is treated as a FAILED
#     dispatch, including "status":"SUCCESS" with no usable response
#   - temp files are cleaned up on both the success and failure paths

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$(cd "$TESTS_DIR/.." && pwd)"
SHIMS_DIR="$TESTS_DIR/shims"

CODEX_BRIDGE="$BIN_DIR/codex-bridge.sh"
AGY_BRIDGE="$BIN_DIR/agy-bridge.sh"

chmod +x "$SHIMS_DIR/agy" "$SHIMS_DIR/codex" 2>/dev/null

# Shims shadow the real CLIs. Nothing in this file may reach a real model.
export PATH="$SHIMS_DIR:$PATH"

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/test-bridges.XXXXXX")"
SCRATCH="$(cd "$SCRATCH" && pwd)"
trap 'rm -rf "$SCRATCH"' EXIT

OUT="$SCRATCH/stdout.txt"
ERR="$SCRATCH/stderr.txt"
ARGV_LOG="$SCRATCH/argv.txt"
STDIN_LOG="$SCRATCH/stdin.txt"

# A prompt built to break naive implementations: quotes, newlines, a command
# substitution and a backtick pair that must survive verbatim.
PROMPT_FILE="$SCRATCH/prompt.txt"
cat > "$PROMPT_FILE" <<'PROMPT'
Line one with "double" and 'single' quotes.
Line two with $(echo INTERPOLATED) and `echo ALSO_INTERPOLATED`.
Line three: $HOME ${UNSET_VAR:-fallback} \n literal backslash-n.
PROMPT

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  printf 'PASS  %s\n' "$1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  printf 'FAIL  %s\n' "$1"
  printf '        %s\n' "$2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label"
  else
    fail "$label" "expected exit $expected, got $actual (stderr: $(head -c 200 "$ERR" | tr '\n' ' '))"
  fi
}

assert_status_nonzero() {
  local label="$1" actual="$2"
  if [[ "$actual" -ne 0 ]]; then
    pass "$label"
  else
    fail "$label" "expected a non-zero exit, got 0"
  fi
}

assert_file_eq() {
  local label="$1" file="$2" expected="$3"
  local actual
  actual="$(cat "$file")"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label"
  else
    fail "$label" "expected [$expected], got [$actual]"
  fi
}

assert_file_empty() {
  local label="$1" file="$2"
  if [[ ! -s "$file" ]]; then
    pass "$label"
  else
    fail "$label" "expected empty, got [$(head -c 200 "$file" | tr '\n' ' ')]"
  fi
}

assert_contains() {
  local label="$1" file="$2" needle="$3"
  if grep -qF -- "$needle" "$file"; then
    pass "$label"
  else
    fail "$label" "expected to find [$needle] in $(basename "$file"): [$(head -c 300 "$file" | tr '\n' ' ')]"
  fi
}

assert_not_contains() {
  local label="$1" file="$2" needle="$3"
  if grep -qF -- "$needle" "$file"; then
    fail "$label" "did not expect [$needle] in $(basename "$file")"
  else
    pass "$label"
  fi
}

assert_no_leftovers() {
  local label="$1" dir="$2"
  local count
  count="$(find "$dir" -mindepth 1 | wc -l | tr -d ' ')"
  if [[ "$count" == "0" ]]; then
    pass "$label"
  else
    fail "$label" "$count temp entrie(s) left behind: $(find "$dir" -mindepth 1 | head -5 | tr '\n' ' ')"
  fi
}

# Runs a bridge with an isolated TMPDIR so temp-file cleanup is observable.
# Sets RUN_STATUS and RUN_TMPDIR.
RUN_STATUS=0
RUN_TMPDIR=""
run_bridge() {
  rm -f "$OUT" "$ERR" "$ARGV_LOG" "$STDIN_LOG"
  RUN_TMPDIR="$(mktemp -d "$SCRATCH/tmpdir.XXXXXX")"
  TMPDIR="$RUN_TMPDIR" \
  FAKE_AGY_ARGV_LOG="$ARGV_LOG" \
  FAKE_CODEX_ARGV_LOG="$ARGV_LOG" \
  FAKE_CODEX_STDIN_LOG="$STDIN_LOG" \
    "$@" > "$OUT" 2> "$ERR"
  RUN_STATUS=$?
}

echo "test-bridges: shims at $SHIMS_DIR"
echo "test-bridges: bridges at $BIN_DIR"
echo

# ---------------------------------------------------------------------------
echo "-- codex-bridge.sh --"
# ---------------------------------------------------------------------------

FAKE_CODEX_CASE=ok run_bridge "$CODEX_BRIDGE" gpt-5.6-sol low read-only "$PROMPT_FILE"
assert_status "codex: successful run exits 0" 0 "$RUN_STATUS"
assert_file_eq "codex: stdout is the model answer verbatim" "$OUT" "$(cat "$PROMPT_FILE")"
assert_file_eq "codex: prompt arrives on stdin, uninterpolated" "$STDIN_LOG" "$(cat "$PROMPT_FILE")"
assert_not_contains "codex: prompt text never appears in argv" "$ARGV_LOG" "Line one with"
assert_not_contains "codex: stderr noise stays out of stdout" "$OUT" "HTTP 500"
assert_not_contains "codex: stderr is quiet on success" "$ERR" "HTTP 500"
assert_contains "codex: --skip-git-repo-check still passed" "$ARGV_LOG" "--skip-git-repo-check"
assert_contains "codex: effort still passed as config override" "$ARGV_LOG" "model_reasoning_effort=low"
assert_contains "codex: sandbox still passed" "$ARGV_LOG" "read-only"
assert_no_leftovers "codex: temp diagnostics file cleaned up after success" "$RUN_TMPDIR"

FAKE_CODEX_CASE=ok CODEX_BRIDGE_DEBUG=1 run_bridge "$CODEX_BRIDGE" gpt-5.6-sol low read-only "$PROMPT_FILE"
assert_contains "codex: CODEX_BRIDGE_DEBUG surfaces stderr diagnostics" "$ERR" "HTTP 500"
assert_not_contains "codex: debug diagnostics still stay out of stdout" "$OUT" "HTTP 500"

FAKE_CODEX_CASE=exit-nonzero run_bridge "$CODEX_BRIDGE" gpt-5.6-sol low read-only "$PROMPT_FILE"
assert_status "codex: propagates the CLI exit code" 5 "$RUN_STATUS"
assert_file_empty "codex: no stdout on failure" "$OUT"
assert_contains "codex: failure names the exit code" "$ERR" "codex exited 5"
assert_contains "codex: failure includes the stderr tail" "$ERR" "401 Unauthorized"
assert_no_leftovers "codex: temp diagnostics file cleaned up after failure" "$RUN_TMPDIR"

FAKE_CODEX_CASE=ok run_bridge "$CODEX_BRIDGE" gpt-5.6-sol banana read-only "$PROMPT_FILE"
assert_status "codex: invalid effort rejected with exit 2" 2 "$RUN_STATUS"
assert_contains "codex: invalid effort explains the allowed values" "$ERR" "none|minimal|low|medium|high|xhigh|max"
assert_file_empty "codex: invalid effort produces no stdout" "$OUT"
assert_file_empty "codex: invalid effort never reaches the CLI" "$ARGV_LOG"

FAKE_CODEX_CASE=ok run_bridge "$CODEX_BRIDGE" gpt-5.6-sol low read-only "$SCRATCH/does-not-exist.txt"
assert_status "codex: unreadable prompt file rejected with exit 2" 2 "$RUN_STATUS"
assert_contains "codex: unreadable prompt file names the path" "$ERR" "cannot read prompt file"

echo

# ---------------------------------------------------------------------------
echo "-- agy-bridge.sh --"
# ---------------------------------------------------------------------------

FAKE_AGY_CASE=ok run_bridge "$AGY_BRIDGE" low "$PROMPT_FILE"
assert_status "agy: successful run exits 0" 0 "$RUN_STATUS"
assert_file_eq "agy: stdout is the parsed response, newlines intact" "$OUT" "$(printf 'BRIDGE-OK first\nBRIDGE-OK second')"
assert_not_contains "agy: JSON envelope never reaches stdout" "$OUT" '"status"'
assert_contains "agy: prompt passed as an @absolute-path reference" "$ARGV_LOG" "@$RUN_TMPDIR"
assert_not_contains "agy: prompt text never appears in argv" "$ARGV_LOG" "Line one with"
assert_contains "agy: json output format requested" "$ARGV_LOG" "json"
assert_contains "agy: permission prompts skipped for headless use" "$ARGV_LOG" "--dangerously-skip-permissions"
assert_no_leftovers "agy: temp prompt + diagnostics cleaned up after success" "$RUN_TMPDIR"

FAKE_AGY_CASE=ok AGY_PRINT_TIMEOUT=90s run_bridge "$AGY_BRIDGE" high "$PROMPT_FILE"
assert_contains "agy: AGY_PRINT_TIMEOUT override reaches the CLI" "$ARGV_LOG" "90s"
assert_contains "agy: effort argument reaches the CLI" "$ARGV_LOG" "high"

FAKE_AGY_CASE=noisy run_bridge "$AGY_BRIDGE" low "$PROMPT_FILE"
assert_status "agy: stderr noise alone is not a failure" 0 "$RUN_STATUS"
assert_file_eq "agy: stdout is only the answer" "$OUT" "CLEAN-ANSWER"
assert_not_contains "agy: CLI stderr noise never mixes into stdout" "$OUT" "plugin warning"

FAKE_AGY_CASE=empty run_bridge "$AGY_BRIDGE" low "$PROMPT_FILE"
assert_status_nonzero "agy: empty response is a FAILED dispatch" "$RUN_STATUS"
assert_file_empty "agy: empty response produces no stdout" "$OUT"
assert_contains "agy: empty response is explained" "$ERR" "empty or whitespace-only response"
assert_no_leftovers "agy: temp files cleaned up after failure" "$RUN_TMPDIR"

FAKE_AGY_CASE=whitespace run_bridge "$AGY_BRIDGE" low "$PROMPT_FILE"
assert_status_nonzero "agy: whitespace-only response is a FAILED dispatch" "$RUN_STATUS"
assert_file_empty "agy: whitespace-only response produces no stdout" "$OUT"
assert_contains "agy: whitespace-only response is explained" "$ERR" "empty or whitespace-only response"

FAKE_AGY_CASE=malformed run_bridge "$AGY_BRIDGE" low "$PROMPT_FILE"
assert_status_nonzero "agy: malformed JSON is a FAILED dispatch" "$RUN_STATUS"
assert_file_empty "agy: malformed JSON produces no stdout" "$OUT"
assert_contains "agy: malformed JSON is explained" "$ERR" "not valid JSON"
assert_contains "agy: malformed JSON failure shows the raw output head" "$ERR" "unterminated"

FAKE_AGY_CASE=missing-field run_bridge "$AGY_BRIDGE" low "$PROMPT_FILE"
assert_status_nonzero "agy: status SUCCESS with no response field still FAILS" "$RUN_STATUS"
assert_file_empty "agy: missing response field produces no stdout" "$OUT"
assert_contains "agy: missing response field is explained" "$ERR" 'no string "response" field'
assert_contains "agy: missing response field lists the keys seen" "$ERR" "conversationId"

FAKE_AGY_CASE=not-object run_bridge "$AGY_BRIDGE" low "$PROMPT_FILE"
assert_status_nonzero "agy: non-object JSON is a FAILED dispatch" "$RUN_STATUS"
assert_contains "agy: non-object JSON is explained" "$ERR" "not a JSON object"

FAKE_AGY_CASE=exit-nonzero run_bridge "$AGY_BRIDGE" low "$PROMPT_FILE"
assert_status_nonzero "agy: CLI non-zero exit is a FAILED dispatch" "$RUN_STATUS"
assert_file_empty "agy: CLI failure produces no stdout" "$OUT"
assert_contains "agy: CLI failure reports the exit code" "$ERR" "agy exit code: 7"
assert_contains "agy: CLI failure includes the stderr tail" "$ERR" "authentication required"
assert_no_leftovers "agy: temp files cleaned up after CLI failure" "$RUN_TMPDIR"

FAKE_AGY_CASE=ok run_bridge "$AGY_BRIDGE" banana "$PROMPT_FILE"
assert_status "agy: invalid effort rejected with exit 2" 2 "$RUN_STATUS"
assert_contains "agy: invalid effort explains the allowed values" "$ERR" "low|medium|high"
assert_file_empty "agy: invalid effort never reaches the CLI" "$ARGV_LOG"

FAKE_AGY_CASE=ok run_bridge "$AGY_BRIDGE" low "$SCRATCH/does-not-exist.txt"
assert_status "agy: unreadable prompt file rejected with exit 2" 2 "$RUN_STATUS"
assert_contains "agy: unreadable prompt file names the path" "$ERR" "cannot read prompt file"

echo
echo "-------------------------------------------"
printf 'PASSED: %d   FAILED: %d\n' "$PASS_COUNT" "$FAIL_COUNT"

if [[ "$FAIL_COUNT" -ne 0 ]]; then
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: PASS"
exit 0
