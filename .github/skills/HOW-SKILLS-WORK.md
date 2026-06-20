# How Skill files are used by the model

_A practical explanation, grounded in this repo's `.github/skills/` setup._

## 1. What a "skill" is

A skill is a **folder of instructions + optional helper files** that teaches the
AI model how to do a specific kind of task in this workspace. In this repo:

```
.github/
├── hooks/
│   └── session-keeper.json          # event hook (separate mechanism, see §7)
└── skills/
    ├── axiomic-dev/
    │   ├── SKILL.md                 # the skill definition (what the model reads)
    │   ├── references/architecture.md
    │   └── scripts/rebuild-wasm.sh
    └── session-keeper/
        ├── SKILL.md
        └── scripts/keep-session.mjs
```

The only file the model is *told about up front* is `SKILL.md`. Everything else
(`scripts/`, `references/`) is **payload** the skill points to when needed.

## 2. The key idea: progressive disclosure

The model does **not** read the full skill content all the time. There are three
levels, loaded only as far as needed:

| Level | What the model sees | When |
| --- | --- | --- |
| **1. Metadata** | `name` + `description` from each `SKILL.md` front‑matter | Always (injected into the system prompt) |
| **2. Body** | The full `SKILL.md` markdown | Only after the model decides the skill is relevant and opens it |
| **3. Resources** | `scripts/*`, `references/*`, etc. | Only when the body tells the model to read/run them |

This keeps the always‑on context small (just short descriptions), while the
heavy detail stays out of the way until it's actually required.

## 3. What the model is given at the start of every conversation

At session start, the system prompt contains a **skills catalog** — one entry
per skill, built from the front‑matter. For this repo it looks like:

```text
<skill>
  <name>session-keeper</name>
  <description>Capture Copilot chat session artifacts … USE WHEN: the user wants
  a summary of a Copilot chat session; keep/save commands…; set up the
  end‑of‑session capture hook.</description>
  <file>…/.github/skills/session-keeper/SKILL.md</file>
</skill>
<skill>
  <name>axiomic-dev</name>
  <description>Develop and maintain the Axiomic … app … USE WHEN: adding/editing
  technical indicators…; rebuilding the WASM bundle…</description>
  <file>…/.github/skills/axiomic-dev/SKILL.md</file>
</skill>
```

So the model permanently knows **three things** about each skill: its name, a
description of *when to use it*, and the **path** to the full instructions.

## 4. How the model decides to use a skill

1. The user sends a message (e.g. _"summarize this session's commands"_).
2. The model compares the request against every skill's `description`, paying
   special attention to the **`USE WHEN:`** triggers authored there.
3. If one matches, the model **reads that `SKILL.md` file** (Level 2) using its
   file‑reading tool — exactly like opening any other file.
4. The `SKILL.md` body then drives the work: it may instruct the model to run a
   bundled script, read a reference doc, or follow a procedure.

Concretely, the `USE WHEN:` phrases are the matching surface. For example,
`session-keeper`'s description lists _"the user wants a summary of a Copilot chat
session"_ and _"set up the end‑of‑session capture hook"_ — so prompts like those
route to it.

## 5. Anatomy of a `SKILL.md`

```markdown
---
name: session-keeper                 # stable id
description: 'Capture Copilot … USE WHEN: …'   # the routing/trigger text
argument-hint: 'e.g. "summarize this session"' # example invocations
---

# Session Keeper                     # ← body starts here (Level 2)
…explanation, file layout, commands the model should run…
```

- **Front‑matter** (`name`, `description`, `argument-hint`) = the *index card*.
  This is what's loaded into context always. The `description` is the single
  most important field because it decides whether the skill ever gets opened.
- **Body** = the actual playbook. It can reference siblings with relative paths,
  e.g. _"runs `keep-session.mjs`"_ or _"see `references/architecture.md`"_.

## 6. Resources: scripts and references (Level 3)

The body links to deeper files; the model only touches them on demand:

- **`scripts/`** — runnable code the model executes via the terminal rather than
  re‑deriving logic each time. Example: `session-keeper/scripts/keep-session.mjs`
  does the log capture; `axiomic-dev/scripts/rebuild-wasm.sh` rebuilds WASM.
- **`references/`** — long background docs pulled in only when relevant. Example:
  `axiomic-dev/references/architecture.md`.

This separation is deliberate: bundling logic as a script means the model runs a
**tested, deterministic** routine instead of regenerating fragile code inline.

## 7. Skills vs. Hooks (don't confuse them)

This repo has **both**, and they're different mechanisms:

| | **Skill** (`skills/*/SKILL.md`) | **Hook** (`hooks/*.json`) |
| --- | --- | --- |
| Trigger | The **model chooses** it based on your request | An **event** fires it automatically (e.g. `Stop` = end of turn) |
| Who runs it | The model, by reading instructions | The Copilot runtime, by executing a command |
| Example | _"summarize this session"_ → model opens `session-keeper/SKILL.md` | `session-keeper.json` runs `keep-session.mjs` every time a turn ends |

They **pair up**: the `session-keeper` *skill* documents the system and lets you
invoke/configure it conversationally, while the `session-keeper` *hook* performs
the same capture automatically without the model in the loop.

## 8. End‑to‑end example

> **You:** "save this session's commands and thinking now"

1. Model scans skill descriptions → matches `session-keeper`'s
   `USE WHEN: … keep/save the commands … save the agent's thinking`.
2. Model reads `.github/skills/session-keeper/SKILL.md` (Level 2).
3. The body says to run the capture script → model runs
   `node ./.github/skills/session-keeper/scripts/keep-session.mjs` (Level 3).
4. Output artifacts land in `.copilot-sessions/`, and the model reports back.

## 9. Why this design

- **Cheap context:** only short descriptions are always loaded; full detail is
  fetched on demand.
- **Reliable behavior:** procedures and scripts are version‑controlled and
  reused verbatim instead of being re‑improvised each time.
- **Discoverable & shareable:** dropping a folder under `.github/skills/` with a
  good `description` is all it takes to teach the model a new capability for this
  workspace.

## 10. Authoring checklist

- Put the skill at `.github/skills/<name>/SKILL.md`.
- Write a crisp `description` with explicit **`USE WHEN:`** triggers — this is
  what gets the skill selected.
- Keep the body actionable; link heavy detail into `references/` and runnable
  logic into `scripts/`.
- Use **relative paths** from `SKILL.md` to its resources.
- If something should run automatically on an event, add a **hook** under
  `.github/hooks/` instead of (or alongside) the skill.
