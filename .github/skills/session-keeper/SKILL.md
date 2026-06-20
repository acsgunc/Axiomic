---
name: session-keeper
description: 'Capture Copilot chat session artifacts into the workspace: copy the raw debug JSONL log and extract a session summary (user prompts, models, tool-usage, files), every terminal command, the agent''s thinking/reasoning, and created/edited files into runnable scripts and readable notes. USE WHEN: the user wants a summary of a Copilot chat session; keep/save the commands or scripts run during a chat session; save/copy the agent''s thinking or reasoning to a file; archive or export a Copilot session; auto-copy the copilot jsonl/debug log at the end of a prompt; reproduce what was run; review or re-run session commands; set up or troubleshoot the end-of-session capture hook. Pairs with the Stop hook at .github/hooks/session-keeper.json which runs automatically when a session ends.'
argument-hint: 'e.g. "summarize this session" or "save this session''s commands and thinking now" or "set up session capture"'
---

# Session Keeper

Persists what happened in a Copilot chat session into the workspace so commands
are reproducible, the agent's reasoning is archived, and the raw log is kept.

Outputs go to `<workspace>/.copilot-sessions/`:

```
.copilot-sessions/
├── summary/<session>.md       # overview: prompts, models, tools, files, counts
├── logs/<session>.jsonl       # raw Copilot debug log (snapshot)
├── commands/<session>.sh      # runnable list of terminal commands (verbatim)
├── commands/<session>.md      # readable commands + files created/edited
├── thinking/<session>.md      # the agent's thinking/reasoning, in order
└── .gitignore                 # ignores logs/ by default, tracks the rest
```

The **summary** is the high-level chat recap. It includes:

- session title (when available), start/end time, duration, and the Copilot / VS
  Code versions;
- an **at-a-glance** table (user prompts, tool calls, terminal commands, files
  touched, thinking blocks);
- the **user's prompts/requests** in order (auto-injected terminal-result and
  "Continue to iterate?" continuations are filtered out);
- **models used** with request counts and input/output token totals;
- a **tool-usage** breakdown; and
- the list of **files created/edited**, with links to the other artifacts.

## When to Use

- The user asks for a **summary / recap** of a Copilot chat session.
- The user asks to **keep / save / export** the commands or scripts run in a chat.
- The user asks to **save the agent's thinking / reasoning** to a file.
- The user wants the **copilot jsonl / debug log copied** into the workspace.
- Reproducing or reviewing what a session executed.
- Setting up or debugging the automatic end-of-session capture.

## Does the log contain thinking?

Yes. In the Copilot debug `main.jsonl`, reasoning is stored on `agent_response`
spans as `attrs.reasoning` (and is also embedded in `llm_request` payloads as
assistant parts of `type: "reasoning"`). Session Keeper reads
`agent_response.attrs.reasoning`, de-duplicates, orders by timestamp, and writes
`thinking/<session>.md`, pairing each block with the visible message that
followed. If the active model does not expose reasoning, the thinking file is
simply skipped.

## How It Works (automatic)

A **Stop hook** ([.github/hooks/session-keeper.json](../../hooks/session-keeper.json))
runs [keep-session.mjs](./scripts/keep-session.mjs) automatically when a chat
session ends ("end of prompt execution"). The script:

1. Finds this workspace's Copilot debug log (`main.jsonl`) via
   `$VSCODE_TARGET_SESSION_LOG`, the hook's stdin session id, or by scanning VS
   Code's `workspaceStorage/*/GitHub.copilot-chat/debug-logs/`.
2. Copies it to `.copilot-sessions/logs/<session>.jsonl`.
3. Writes `summary/<session>.md` (user prompts, models, tool usage, files,
   counts), parses `run_in_terminal` spans → writes `<session>.sh` (executable)
   and `<session>.md`, lists `create_file` / `replace_string_in_file` targets, and
   writes `thinking/<session>.md` from `agent_response.attrs.reasoning`.

The hook is non-blocking and never fails a session; it reports a short summary
via `systemMessage`.

## Run It Manually

```bash
# Capture the most recent session for the current workspace:
node ./.github/skills/session-keeper/scripts/keep-session.mjs

# Capture a specific session log explicitly:
VSCODE_TARGET_SESSION_LOG="/path/to/debug-logs/<sessionId>" \
  node ./.github/skills/session-keeper/scripts/keep-session.mjs
```

Then re-run captured commands after review:

```bash
bash .copilot-sessions/commands/<session>.sh
```

> Always review `<session>.sh` before running — commands are reproduced verbatim
> and may include destructive or environment-specific steps.

## Configuration

- **Disable auto-capture**: delete or rename
  [.github/hooks/session-keeper.json](../../hooks/session-keeper.json).
- **Commit full logs too**: remove the `logs/` line from
  `.copilot-sessions/.gitignore` (logs can be large — often 10 MB+ per session).
- **Override the workspace target**: set `SESSION_KEEPER_WORKSPACE`.

## Notes

- Requires Node.js (already used by this project). No extra dependencies.
- Raw logs are git-ignored by default; the extracted `commands/` are tracked so
  the useful, small artifacts are kept in version control.
- Terminal commands are de-duplicated and ordered by timestamp.
