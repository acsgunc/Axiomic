---
name: session-keeper
description: 'Capture Copilot chat session artifacts into the workspace across VS Code, VS Code Insiders, and Visual Studio: copy the raw debug JSONL log and the conversation transcript JSONL, and extract a session summary (user prompts, models, tool-usage, files), every terminal command, the agent''s thinking/reasoning, the agent''s full visible chat replies, and created/edited files into runnable scripts and readable notes (Visual Studio logs are unstructured, so its capture is the raw trace log plus a metadata summary). USE WHEN: the user wants a summary of a Copilot chat session; keep/save the commands or scripts run during a chat session; save/copy the agent''s thinking or reasoning to a file; save/copy the agent''s replies or final answer/summary to a file; copy the copilot transcript/jsonl/debug log into the workspace; archive or export a Copilot session; auto-copy the copilot jsonl/transcript at the end of a prompt; reproduce what was run; review or re-run session commands; set up or troubleshoot the end-of-session capture hook. Pairs with the Stop hook at .github/hooks/session-keeper.json which runs automatically when a session ends.'
argument-hint: 'e.g. "summarize this session" or "save this session''s commands and thinking now" or "set up session capture"'
---

# Session Keeper

Persists what happened in a Copilot chat session into the workspace so commands
are reproducible, the agent's reasoning is archived, and the raw log is kept.

Works across **VS Code**, **VS Code Insiders**, and **Visual Studio**:

- **VS Code / VS Code Insiders** — full extraction from Copilot's structured
  debug log (`main.jsonl`): prompts, models, tool usage, terminal commands, the
  agent's thinking, and touched files.
- **Visual Studio** — Visual Studio records an *unstructured* diagnostic trace
  (`%LOCALAPPDATA%\Temp\VSGitHubCopilotLogs\*.chat.log`) rather than the span
  log VS Code emits, so prompts/commands/thinking cannot be extracted. Session
  Keeper copies the raw trace log and writes a metadata summary (start/end time,
  duration, Copilot Chat + Visual Studio versions, session GUID).

Outputs go to `<workspace>/.copilot-sessions/`:

```
.copilot-sessions/
├── summary/<session>.md             # overview: prompts, models, tools, files, counts
├── logs/<session>.jsonl             # raw Copilot debug log (snapshot)
├── logs/<session>.transcript.jsonl  # conversation transcript (snapshot)
├── commands/<session>.sh            # runnable list of terminal commands (verbatim)
├── commands/<session>.md            # readable commands + files created/edited
├── thinking/<session>.md            # the agent's thinking/reasoning, in order
├── responses/<session>.md           # the agent's full visible chat replies, in order
└── .gitignore                       # ignores logs/ by default, tracks the rest
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
- The user asks to **save the agent's replies / final answer / summary** to a file.
- The user wants the **copilot jsonl / debug log / transcript copied** into the
  workspace.
- Reproducing or reviewing what a session executed.
- Setting up or debugging the automatic end-of-session capture.

## Does the log contain thinking?

It depends on the **model**, but capture is **model-agnostic**. In the Copilot
debug `main.jsonl`, reasoning (when a model emits it) is stored on
`agent_response` spans as `attrs.reasoning`. Session Keeper reads that field,
normalizes whatever shape the model used (a plain string, or structured
reasoning blocks), de-duplicates, orders by timestamp, and writes
`thinking/<session>.md`, pairing each block with the visible message that
followed.

Because extraction keys off the span structure (not the model name), it works
for any model — Claude, GPT, Gemini, etc. Models that don't surface reasoning
(e.g. `gpt-4o-mini`, internal router models) simply produce no `attrs.reasoning`,
so the thinking file is skipped for that session; everything else (prompts,
commands, models, files) is still captured.

## How It Works (automatic)

A **Stop hook** ([.github/hooks/session-keeper.json](../../hooks/session-keeper.json))
runs [keep-session.mjs](./scripts/keep-session.mjs) automatically when a chat
session ends ("end of prompt execution"). The script:

1. Finds this workspace's Copilot debug log (`main.jsonl`) via
   `$VSCODE_TARGET_SESSION_LOG`, the hook's stdin session id, or by scanning VS
   Code's `workspaceStorage/*/GitHub.copilot-chat/debug-logs/`. If no VS Code log
   exists, it falls back to the newest Visual Studio `*.chat.log`.
2. Copies it to `.copilot-sessions/logs/<session>.jsonl`, and copies the sibling
   conversation transcript
   (`GitHub.copilot-chat/transcripts/<session>.jsonl`) to
   `.copilot-sessions/logs/<session>.transcript.jsonl` when present.
3. Writes `summary/<session>.md` (user prompts, models, tool usage, files,
   counts), parses `run_in_terminal` spans → writes `<session>.sh` (executable)
   and `<session>.md`, lists `create_file` / `replace_string_in_file` targets,
   writes `thinking/<session>.md` from `agent_response.attrs.reasoning`, and
   writes `responses/<session>.md` with the agent's full visible chat replies
   (the complete message text shown in the panel, in order).

The Stop hook is a **VS Code Copilot** feature, so automatic capture only fires
in VS Code / VS Code Insiders. In **Visual Studio**, run the script manually (see
below); it detects and captures the Visual Studio trace log instead, writing
`logs/<session>.chat.log` plus a metadata-only `summary/<session>.md`.

The hook is non-blocking and never fails a session; it reports a short summary
via `systemMessage`.

## Run It Manually

```bash
# Capture the most recent session for the current workspace:
node ./.github/skills/session-keeper/scripts/keep-session.mjs

# Capture a specific session log explicitly (VS Code folder/main.jsonl, or a
# Visual Studio *.chat.log file):
VSCODE_TARGET_SESSION_LOG="/path/to/debug-logs/<sessionId>" \
  node ./.github/skills/session-keeper/scripts/keep-session.mjs
```

In **Visual Studio**, point the script at the trace log directly:

```bash
VSCODE_TARGET_SESSION_LOG="%LOCALAPPDATA%/Temp/VSGitHubCopilotLogs/<stamp>_VSGitHubCopilot.chat.log" \
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
- **Model-agnostic:** parsing keys off span types (`user_message`, `tool_call`,
  `run_in_terminal`, `agent_response`, `llm_request`), not model names, so it
  works for any model. Sessions that switch models mid-way are handled — the
  summary's "Models used" table aggregates per model. Reasoning is captured for
  any model that emits it; models that don't simply have an empty thinking file.

