#!/usr/bin/env bash
#
# agy-bridge.sh — dispatch a prompt to the Antigravity agent (Gemini-backed)
# through the `agy` CLI's headless print mode, and return its answer.
#
# Usage:
#   agy-bridge.sh <effort> <prompt-file>
#
#   effort   low | medium | high
#
# Env overrides:
#   AGY_PRINT_TIMEOUT   passed to --print-timeout (default 20m; use e.g. 2m
#                       for smoke tests — do not wait 20 minutes for a ping)
#   AGY_MODEL           passed to --model when set; otherwise agy's default
#
# This is the fleet's only Antigravity route. The former one-way IDE
# dispatcher `antigravity-dispatch.sh` (which talked to the IDE and could
# not return an answer) was removed 2026-08-13; this route returns answers.
#
# Observed behaviour, checked 2026-08-13 against agy 1.1.12:
#   - `agy -p` / `--print` runs a single prompt non-interactively and prints
#     the response; `--output-format json` wraps it in a JSON envelope.
#   - `agy -p -` does NOT read the prompt from stdin. The prompt must be an
#     `@/absolute/path` file reference, so this script copies the caller's
#     prompt to a quoted absolute temp path and references that. Prompt text
#     never passes through argv or shell interpolation.
#   - stdin is detached (`< /dev/null`) so the CLI can never block on a tty.
#
# CAUTION: headless mode has nobody to answer a permission prompt, so this runs
# `--dangerously-skip-permissions` and the agent CAN act on the workspace.
# There is no sandbox argument here (unlike codex-bridge.sh): agy exposes a
# `--sandbox` flag but its argument form is unverified, so it is deliberately
# left unwired rather than guessed at. Prefer read-and-report prompts.
#
# Failure semantics — ALL of these are a failed dispatch, exit non-zero, even
# when the JSON envelope claims "status":"SUCCESS":
#   - agy exits non-zero
#   - stdout is not valid JSON / not a JSON object
#   - no string `response` field
#   - `response` is empty or whitespace-only
# On failure the exit code, a tail of agy's stderr and the head of its raw
# stdout go to stderr. stdout carries the answer and nothing else, ever.
#
# Exit 0 = answer; 1 = failed dispatch; 2 = usage error; 127 = agy/node missing.

set -uo pipefail

EFFORT="${1:?effort required (low|medium|high)}"
PROMPT_FILE="${2:?prompt file required}"

PRINT_TIMEOUT="${AGY_PRINT_TIMEOUT:-20m}"

case "$EFFORT" in
  low|medium|high) ;;
  *)
    echo "agy-bridge: invalid effort '$EFFORT' (low|medium|high)" >&2
    exit 2
    ;;
esac

if [[ ! -r "$PROMPT_FILE" ]]; then
  echo "agy-bridge: cannot read prompt file: $PROMPT_FILE" >&2
  exit 2
fi

if ! command -v agy >/dev/null 2>&1; then
  echo "agy-bridge: agy CLI not found on PATH (expected ~/.local/bin/agy)" >&2
  exit 127
fi

if ! command -v node >/dev/null 2>&1; then
  echo "agy-bridge: node not found on PATH (needed to parse agy's JSON)" >&2
  exit 127
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/agy-bridge.XXXXXX")" || {
  echo "agy-bridge: could not create temp working directory" >&2
  exit 2
}
trap 'rm -rf "$WORKDIR"' EXIT
# agy resolves @-references itself; hand it an unambiguous absolute path.
WORKDIR="$(cd "$WORKDIR" && pwd)"

PROMPT_COPY="$WORKDIR/prompt.txt"
RAW="$WORKDIR/response.json"
DIAG="$WORKDIR/stderr.log"
ANSWER="$WORKDIR/answer.txt"
PARSE_ERR="$WORKDIR/parse.log"

if ! cp "$PROMPT_FILE" "$PROMPT_COPY"; then
  echo "agy-bridge: could not stage prompt file into $WORKDIR" >&2
  exit 2
fi

AGY_ARGS=(-p "@$PROMPT_COPY"
  --effort "$EFFORT"
  --output-format json
  --print-timeout "$PRINT_TIMEOUT"
  --dangerously-skip-permissions)
[[ -n "${AGY_MODEL:-}" ]] && AGY_ARGS+=(--model "$AGY_MODEL")

agy "${AGY_ARGS[@]}" > "$RAW" 2> "$DIAG" < /dev/null
STATUS=$?

fail() {
  echo "agy-bridge: $1" >&2
  echo "agy-bridge: agy exit code: $STATUS (effort=$EFFORT timeout=$PRINT_TIMEOUT)" >&2
  echo "agy-bridge: --- agy stderr, last 20 lines ---" >&2
  tail -n 20 "$DIAG" >&2
  echo "agy-bridge: --- agy raw stdout, first 20 lines ---" >&2
  head -n 20 "$RAW" >&2
  echo "agy-bridge: --- end diagnostics ---" >&2
  exit 1
}

if [[ $STATUS -ne 0 ]]; then
  fail "agy exited non-zero; no answer returned."
fi

node -e '
const fs = require("fs");
let raw;
try {
  raw = fs.readFileSync(process.argv[1], "utf8");
} catch (e) {
  process.stderr.write("cannot read agy output file: " + e.message + "\n");
  process.exit(2);
}
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  process.stderr.write("agy stdout is not valid JSON: " + e.message + "\n");
  process.exit(3);
}
if (data === null || typeof data !== "object" || Array.isArray(data)) {
  process.stderr.write("agy stdout is not a JSON object\n");
  process.exit(4);
}
const response = data.response;
if (typeof response !== "string") {
  process.stderr.write(
    "agy JSON has no string \"response\" field (keys present: " +
      Object.keys(data).join(", ") + ")\n"
  );
  process.exit(5);
}
if (response.trim() === "") {
  process.stderr.write("agy returned an empty or whitespace-only response\n");
  process.exit(6);
}
process.stdout.write(response.endsWith("\n") ? response : response + "\n");
' "$RAW" > "$ANSWER" 2> "$PARSE_ERR"

PARSE_STATUS=$?
if [[ $PARSE_STATUS -ne 0 ]]; then
  fail "$(tr '\n' ' ' < "$PARSE_ERR" | sed 's/ *$//')"
fi

cat "$ANSWER"
exit 0
