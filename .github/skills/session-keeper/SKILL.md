---
name: session-keeper
description: 'Capture Copilot chat session artifacts into the workspace: copy the raw debug JSONL log and extract every terminal command (and created/edited files) into runnable scripts. USE WHEN: the user wants to keep/save the commands or scripts run during a chat session; archive or export a Copilot session; auto-copy the copilot jsonl/debug log at the end of a prompt; reproduce what was run; review or re-run session commands; set up or troubleshoot the end-of-session capture hook. Pairs with the Stop hook at .github/hooks/session-keeper.json which runs automatically when a session ends.'
argument-hint: 'e.g. "save this session''s commands now" or "set up session capture"'
---

# Session Keeper

Persists what happened in a Copilot chat session into the workspace so commands
are reproducible and the raw log is archived.

Outputs go to `<workspace>/.copilot-sessions/`:

```
.copilot-sessions/
├── logs/<session>.jsonl       # raw Copilot debug log (snapshot)
├── commands/<session>.sh      # runnable list of terminal commands (verbatim)
├── commands/<session>.md      # readable commands + files created/edited
└── .gitignore                 # ignores logs/ by default, tracks commands/
```

## When to Use

- The user asks to **keep / save / export** the commands or scripts run in a chat.
- The user wants the **copilot jsonl / debug log copied** into the workspace.
- Reproducing or reviewing what a session executed.
- Setting up or debugging the automatic end-of-session capture.

## How It Works (automatic)

A **Stop hook** ([.github/hooks/session-keeper.json](../../hooks/session-keeper.json))
runs [keep-session.mjs](./scripts/keep-session.mjs) automatically when a chat
session ends ("end of prompt execution"). The script:

1. Finds this workspace's Copilot debug log (`main.jsonl`) via
   `$VSCODE_TARGET_SESSION_LOG`, the hook's stdin session id, or by scanning VS
   Code's `workspaceStorage/*/GitHub.copilot-chat/debug-logs/`.
2. Copies it to `.copilot-sessions/logs/<session>.jsonl`.
3. Parses `run_in_terminal` spans → writes `<session>.sh` (executable) and
   `<session>.md`, and lists `create_file` / `replace_string_in_file` targets.

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
