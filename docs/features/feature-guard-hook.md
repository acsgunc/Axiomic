# Feature Guard Hook

> A Stop hook that won't let a turn end if code changed without matching
> `docs/features/` docs and tests.

## Summary

Automates the **feature-docs** and **feature-tests** skills: when a session
changes buildable source under `core/src`, `data/src`,
`desktop/src-tauri/src`, `web/src`, or `proxy/src` but doesn't also update a
page under `docs/features/` and/or a test file, the hook blocks the stop and
tells the agent to finish those follow-ups first.

## Status

- **Added** — 2026-06-21

## How to use

It runs automatically as a Copilot **Stop** hook — no action needed. To run it
manually (clean piped stdin, avoids the Git Bash winpty TTY quirk):

```bash
node -e "const{spawnSync}=require('child_process');\
const r=spawnSync('node',['./.github/hooks/scripts/feature-guard.mjs'],{input:'{}',encoding:'utf8'});\
console.log(r.stdout);"
```

Output is one of:

- `{"continue":true}` — no source changed, or docs + tests already updated.
- `{"decision":"block","reason":"…"}` — source changed; the reason lists the
  files and the skills to complete before stopping.

Disable temporarily by removing or renaming
[.github/hooks/feature-guard.json](../../.github/hooks/feature-guard.json).

## Notes / caveats

- **No loop risk:** when the hook re-fires with `stop_hook_active: true` it
  returns `{"continue":true}`, so it blocks at most once per stop.
- **Escape hatch:** purely internal changes (refactor/format/test-only) can be
  recorded in the `docs/features/README.md` changelog instead of a full page.
- **Fail-open:** any error (no git, bad input) resolves to non-blocking so it
  can never wedge a session.
- Classification is path/extension based — see `isSource`, `isTest`,
  `isFeatureDoc` in the script.

## Source

- [.github/hooks/feature-guard.json](../../.github/hooks/feature-guard.json) — Stop hook registration
- [.github/hooks/scripts/feature-guard.mjs](../../.github/hooks/scripts/feature-guard.mjs) — detection + block logic
