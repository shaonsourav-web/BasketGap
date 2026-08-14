#!/usr/bin/env bash
#
# codex-bridge.sh — dispatch a prompt to a Codex model and return its answer.
#
# Usage:
#   codex-bridge.sh <model> <effort> <sandbox> <prompt-file>
#
#   model    gpt-5.6-sol | gpt-5.6-terra | gpt-5.6-luna | gpt-5.6-pro
#   effort   none | minimal | low | medium | high | xhigh | max
#   sandbox  read-only | workspace-write | danger-full-access
#
# The prompt is passed via FILE, and the file is fed to codex on STDIN — it
# never touches argv. Prompts routinely contain quotes, newlines and code that
# shell quoting mangles, and a long one blows past macOS ARG_MAX.
#
# Verified behaviours this script works around (2026-08-13, codex-cli 0.144.1):
#   - `codex exec [PROMPT]`: with NO prompt argument, instructions are read
#     from stdin (`codex exec --help`). We rely on that and redirect the prompt
#     file in. A prompt argument PLUS piped stdin would wrap stdin in a
#     `<stdin>` block instead, so the argument is deliberately omitted.
#   - It hangs if stdin is a tty. Redirecting a real file also fixes that.
#   - It refuses to run outside a trusted git repo unless told otherwise.
#   - Its MCP plugin layer emits HTTP 500 stack noise on stderr that is
#     unrelated to the request. Stderr is captured to a temp diagnostics file
#     rather than discarded: kept out of stdout on success so noise is never
#     mistaken for the answer, tailed to stderr on failure so a broken run is
#     diagnosable. Set CODEX_BRIDGE_DEBUG=1 to see it on success too.
#   - A trivial call still costs ~20k tokens. Do not use these models for
#     work a Claude agent could do.
#
# stdout is the answer and nothing else. Exit 0 = answer; 2 = usage error;
# 127 = codex not installed; anything else = codex's own exit status.

set -uo pipefail

MODEL="${1:?model required}"
EFFORT="${2:?effort required}"
SANDBOX="${3:?sandbox required}"
PROMPT_FILE="${4:?prompt file required}"

if [[ ! -r "$PROMPT_FILE" ]]; then
  echo "codex-bridge: cannot read prompt file: $PROMPT_FILE" >&2
  exit 2
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex-bridge: codex CLI not found on PATH" >&2
  exit 127
fi

case "$EFFORT" in
  none|minimal|low|medium|high|xhigh|max) ;;
  *)
    echo "codex-bridge: invalid effort '$EFFORT' (none|minimal|low|medium|high|xhigh|max)" >&2
    exit 2
    ;;
esac

DIAG="$(mktemp "${TMPDIR:-/tmp}/codex-bridge.XXXXXX")" || {
  echo "codex-bridge: could not create diagnostics temp file" >&2
  exit 2
}
trap 'rm -f "$DIAG"' EXIT

codex exec \
  --model "$MODEL" \
  --config model_reasoning_effort="$EFFORT" \
  --sandbox "$SANDBOX" \
  --skip-git-repo-check \
  < "$PROMPT_FILE" 2> "$DIAG"

STATUS=$?
if [[ $STATUS -ne 0 ]]; then
  echo "codex-bridge: codex exited $STATUS (model=$MODEL effort=$EFFORT)" >&2
  echo "codex-bridge: --- codex stderr, last 40 lines ---" >&2
  tail -n 40 "$DIAG" >&2
  echo "codex-bridge: --- end codex stderr ---" >&2
elif [[ -n "${CODEX_BRIDGE_DEBUG:-}" && -s "$DIAG" ]]; then
  echo "codex-bridge: --- codex stderr (debug), last 40 lines ---" >&2
  tail -n 40 "$DIAG" >&2
  echo "codex-bridge: --- end codex stderr ---" >&2
fi
exit $STATUS
