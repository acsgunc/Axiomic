#!/usr/bin/env node
/**
 * Session Keeper — end-of-session capture.
 *
 * Runs as a Copilot `Stop` hook (and can be run manually). It:
 *   1. Locates this workspace's Copilot chat debug log (`main.jsonl`).
 *   2. Copies it into `<workspace>/.copilot-sessions/logs/<session>.jsonl`.
 *   3. Extracts every terminal command run during the session into a runnable
 *      `<workspace>/.copilot-sessions/commands/<session>.sh` plus a human-
 *      readable `commands.md`, and lists files the agent created/edited.
 *   4. Writes a human-readable `summary/<session>.md` overview: the user's
 *      prompts/requests, models used, tool-usage breakdown, token totals, files
 *      touched, and links to the other artifacts.
 *
 * It is intentionally defensive: any failure is swallowed and reported via the
 * hook's JSON output so it can never break a chat session.
 *
 * Resolution order for the log:
 *   1. $VSCODE_TARGET_SESSION_LOG  (folder or file — most reliable)
 *   2. session id parsed from the hook's stdin JSON
 *   3. newest `main.jsonl` across all VS Code workspaceStorage debug-logs
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const OUT_DIRNAME = '.copilot-sessions';

main();

async function main() {
  const notes = [];
  try {
    const stdin = await readStdin();
    const input = safeJson(stdin) ?? {};

    const workspace = resolveWorkspace(input);
    const { logFile, sessionId } = resolveLog(input);

    if (!logFile || !fs.existsSync(logFile)) {
      return done(true, 'Session Keeper: no debug log found to capture.');
    }

    const outRoot = path.join(workspace, OUT_DIRNAME);
    const logsDir = path.join(outRoot, 'logs');
    const cmdDir = path.join(outRoot, 'commands');
    const thinkDir = path.join(outRoot, 'thinking');
    const summaryDir = path.join(outRoot, 'summary');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.mkdirSync(thinkDir, { recursive: true });
    fs.mkdirSync(summaryDir, { recursive: true });

    // 1. Copy the raw JSONL log (latest snapshot for this session).
    const logCopy = path.join(logsDir, `${sessionId}.jsonl`);
    fs.copyFileSync(logFile, logCopy);
    notes.push(`log → ${rel(workspace, logCopy)}`);

    // 2. Parse and extract commands, thinking, touched files, and metadata.
    const session = parseSession(logFile);
    const { commands, thoughts, files } = session;

    // 2a. Always write a session summary (the high-level overview).
    writeSummaryMarkdown(
      path.join(summaryDir, `${sessionId}.md`),
      sessionId,
      session,
    );
    notes.push(`summary → ${rel(workspace, summaryDir)}`);

    if (commands.length) {
      writeShellScript(path.join(cmdDir, `${sessionId}.sh`), sessionId, commands);
      writeCommandsMarkdown(path.join(cmdDir, `${sessionId}.md`), sessionId, commands, files);
      notes.push(`${commands.length} commands → ${rel(workspace, cmdDir)}`);
    } else {
      notes.push('no terminal commands found in this session');
    }

    // 3. Capture the agent's thinking/reasoning.
    if (thoughts.length) {
      writeThinkingMarkdown(path.join(thinkDir, `${sessionId}.md`), sessionId, thoughts);
      notes.push(`${thoughts.length} thinking blocks → ${rel(workspace, thinkDir)}`);
    } else {
      notes.push('no thinking captured (model may not expose reasoning)');
    }

    ensureGitignore(outRoot);

    return done(true, `Session Keeper: ${notes.join('; ')}.`);
  } catch (err) {
    return done(true, `Session Keeper skipped: ${err?.message ?? err}`);
  }
}

// ---------------------------------------------------------------------------
// Log resolution
// ---------------------------------------------------------------------------

function resolveWorkspace(input) {
  return (
    process.env.SESSION_KEEPER_WORKSPACE ||
    input.workspaceFolder ||
    input.cwd ||
    process.env.VSCODE_CWD ||
    process.cwd()
  );
}

function resolveLog(input) {
  // 1. Direct env pointer to the active session log.
  const env = process.env.VSCODE_TARGET_SESSION_LOG;
  if (env && fs.existsSync(env)) {
    const stat = fs.statSync(env);
    if (stat.isDirectory()) {
      return { logFile: path.join(env, 'main.jsonl'), sessionId: path.basename(env) };
    }
    return { logFile: env, sessionId: path.basename(path.dirname(env)) };
  }

  // 2. Session id from stdin, matched against known debug-logs.
  const sid =
    input.sessionId || input.session_id || input.sid || input.id || null;
  const candidates = findAllLogs();
  if (sid) {
    const hit = candidates.find((c) => c.sessionId === sid);
    if (hit) return hit;
  }

  // 3. Newest log overall.
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0] ?? { logFile: null, sessionId: 'unknown' };
}

/** Returns every `main.jsonl` under any VS Code workspaceStorage debug-logs dir. */
function findAllLogs() {
  const roots = debugLogRoots();
  const out = [];
  for (const root of roots) {
    if (!safeExists(root)) continue;
    // root/<workspaceStorageId>/GitHub.copilot-chat/debug-logs/<sessionId>/main.jsonl
    for (const wsId of safeReaddir(root)) {
      const base = path.join(root, wsId, 'GitHub.copilot-chat', 'debug-logs');
      if (!safeExists(base)) continue;
      for (const sessionId of safeReaddir(base)) {
        const logFile = path.join(base, sessionId, 'main.jsonl');
        if (safeExists(logFile)) {
          out.push({ logFile, sessionId, mtime: safeMtime(logFile) });
        }
      }
    }
  }
  return out;
}

/** Platform-specific VS Code `User/workspaceStorage` roots (stable + Insiders). */
function debugLogRoots() {
  const home = os.homedir();
  const variants = ['Code', 'Code - Insiders'];
  let bases = [];
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    bases = variants.map((v) => path.join(appData, v, 'User', 'workspaceStorage'));
  } else if (process.platform === 'darwin') {
    bases = variants.map((v) =>
      path.join(home, 'Library', 'Application Support', v, 'User', 'workspaceStorage'),
    );
  } else {
    bases = variants.map((v) => path.join(home, '.config', v, 'User', 'workspaceStorage'));
  }
  return bases;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Extracts terminal commands, the agent's thinking, and touched files from a
 * session JSONL.
 *
 * - Terminal commands come from `run_in_terminal` spans whose `attrs.args` is a
 *   JSON string `{ command, explanation, goal, mode }`.
 * - Thinking comes from `agent_response` spans: `attrs.reasoning` holds the
 *   reasoning text, and `attrs.response` (a JN string of assistant messages)
 *   provides the visible text that followed, used as context.
 */
function parseSession(logFile) {
  const lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/);
  const commands = [];
  const thoughts = [];
  const files = new Set();
  const prompts = [];
  const toolCounts = new Map();
  const models = new Map(); // model -> { calls, inputTokens, outputTokens }
  const meta = { copilotVersion: '', vscodeVersion: '', title: '' };
  const seenCmd = new Set();
  const seenThought = new Set();
  let firstTs = 0;
  let lastTs = 0;
  let toolCallTotal = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    let span;
    try {
      span = JSON.parse(line);
    } catch {
      continue;
    }
    const name = span.name;
    const type = span.type;
    const attrs = span.attrs || {};
    if (span.ts) {
      if (!firstTs || span.ts < firstTs) firstTs = span.ts;
      if (span.ts > lastTs) lastTs = span.ts;
    }

    if (type === 'session_start') {
      if (attrs.copilotVersion) meta.copilotVersion = attrs.copilotVersion;
      if (attrs.vscodeVersion) meta.vscodeVersion = attrs.vscodeVersion;
    }
    if (name === 'title' && attrs.label && attrs.label !== 'title') {
      meta.title = attrs.label;
    }

    if (type === 'user_message' && typeof attrs.content === 'string') {
      const content = attrs.content.trim();
      // Skip auto-injected continuations (terminal-result notifications and the
      // "Continue to iterate?" auto-prompts) so only real user input is listed.
      const injected =
        content.startsWith('[Terminal ') ||
        /^Continue: /.test(content) ||
        content.startsWith('<reminderInstructions>');
      if (content && !injected) prompts.push({ content, ts: span.ts || 0 });
    }

    if (type === 'tool_call') {
      toolCallTotal++;
      toolCounts.set(name, (toolCounts.get(name) || 0) + 1);
    }

    if (type === 'llm_request' && attrs.model) {
      const m = models.get(attrs.model) || {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      m.calls++;
      m.inputTokens += Number(attrs.inputTokens) || 0;
      m.outputTokens += Number(attrs.outputTokens) || 0;
      models.set(attrs.model, m);
    }

    if (name === 'run_in_terminal') {
      const args = safeJson(attrs.args);
      const command = args?.command;
      if (typeof command === 'string' && command.trim()) {
        const key = command.trim();
        if (!seenCmd.has(key)) {
          seenCmd.add(key);
          commands.push({
            command: key,
            goal: args.goal || '',
            explanation: args.explanation || '',
            mode: args.mode || '',
            ts: span.ts || 0,
          });
        }
      }
    } else if (type === 'agent_response' || name === 'agent_response') {
      const reasoning =
        typeof attrs.reasoning === 'string' ? attrs.reasoning.trim() : '';
      if (reasoning) {
        const key = reasoning.slice(0, 200);
        if (!seenThought.has(key)) {
          seenThought.add(key);
          thoughts.push({
            reasoning,
            text: firstAssistantText(attrs.response),
            ts: span.ts || 0,
          });
        }
      }
    } else if (
      name === 'create_file' ||
      name === 'replace_string_in_file' ||
      name === 'multi_replace_string_in_file'
    ) {
      const args = safeJson(attrs.args) || {};
      const fp = args.filePath || args.path;
      if (typeof fp === 'string') files.add(`${name}: ${fp}`);
    }
  }

  commands.sort((a, b) => a.ts - b.ts);
  thoughts.sort((a, b) => a.ts - b.ts);
  prompts.sort((a, b) => a.ts - b.ts);
  return {
    commands,
    thoughts,
    files: [...files],
    prompts,
    toolCounts: [...toolCounts.entries()].sort((a, b) => b[1] - a[1]),
    models: [...models.entries()],
    meta,
    firstTs,
    lastTs,
    toolCallTotal,
  };
}

/** Pulls the first visible assistant text part from an `attrs.response` blob. */
function firstAssistantText(response) {
  const parsed = safeJson(response);
  if (!Array.isArray(parsed)) return '';
  for (const msg of parsed) {
    if (!msg || !Array.isArray(msg.parts)) continue;
    for (const p of msg.parts) {
      if (p && p.type === 'text' && typeof p.content === 'string' && p.content.trim()) {
        return p.content.trim();
      }
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Output writers
// ---------------------------------------------------------------------------

/**
 * Writes the high-level session summary: the user's prompts/requests, models
 * used, tool-usage breakdown, token totals, touched files, and links to the
 * other captured artifacts.
 */
function writeSummaryMarkdown(file, sessionId, s) {
  const { commands, thoughts, files, prompts, toolCounts, models, meta } = s;
  const out = [];

  out.push(`# Session summary — ${sessionId}`);
  out.push('');
  if (meta.title) out.push(`**Title:** ${meta.title}`);
  const started = s.firstTs ? new Date(s.firstTs).toISOString() : 'unknown';
  const ended = s.lastTs ? new Date(s.lastTs).toISOString() : 'unknown';
  out.push(`**Started:** ${started}  ·  **Ended:** ${ended}`);
  if (s.firstTs && s.lastTs) {
    out.push(`**Duration:** ${formatDuration(s.lastTs - s.firstTs)}`);
  }
  if (meta.copilotVersion || meta.vscodeVersion) {
    out.push(
      `**Environment:** Copilot ${meta.copilotVersion || '?'} · VS Code ${
        meta.vscodeVersion || '?'
      }`,
    );
  }
  out.push('');

  // At-a-glance counts.
  out.push('## At a glance');
  out.push('');
  out.push('| Metric | Count |');
  out.push('| --- | --- |');
  out.push(`| User prompts | ${prompts.length} |`);
  out.push(`| Tool calls | ${s.toolCallTotal} |`);
  out.push(`| Terminal commands | ${commands.length} |`);
  out.push(`| Files created/edited | ${files.length} |`);
  out.push(`| Thinking blocks | ${thoughts.length} |`);
  out.push('');

  // The user's prompts/requests — the actual "chat summary".
  out.push('## User prompts');
  out.push('');
  if (prompts.length) {
    prompts.forEach((p, i) => {
      out.push(`### ${i + 1}.${p.ts ? ` (${new Date(p.ts).toISOString()})` : ''}`);
      out.push('');
      out.push('> ' + truncate(collapse(p.content), 600).replace(/\n/g, '\n> '));
      out.push('');
    });
  } else {
    out.push('_No user prompts captured._');
    out.push('');
  }

  // Models used.
  if (models.length) {
    out.push('## Models used');
    out.push('');
    out.push('| Model | Requests | Input tokens | Output tokens |');
    out.push('| --- | --: | --: | --: |');
    for (const [name, m] of models) {
      out.push(
        `| ${name} | ${m.calls} | ${m.inputTokens.toLocaleString()} | ${m.outputTokens.toLocaleString()} |`,
      );
    }
    out.push('');
  }

  // Tool usage breakdown.
  if (toolCounts.length) {
    out.push('## Tool usage');
    out.push('');
    out.push('| Tool | Calls |');
    out.push('| --- | --: |');
    for (const [name, n] of toolCounts) out.push(`| ${name} | ${n} |`);
    out.push('');
  }

  // Files touched.
  if (files.length) {
    out.push('## Files created / edited');
    out.push('');
    for (const f of files) out.push(`- ${f}`);
    out.push('');
  }

  // Cross-links to the other artifacts.
  out.push('## Related artifacts');
  out.push('');
  out.push(`- Raw log: \`logs/${sessionId}.jsonl\``);
  if (commands.length) {
    out.push(`- Commands: \`commands/${sessionId}.sh\` · \`commands/${sessionId}.md\``);
  }
  if (thoughts.length) out.push(`- Thinking: \`thinking/${sessionId}.md\``);
  out.push('');

  fs.writeFileSync(file, out.join('\n'), 'utf8');
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Collapses excessive blank lines so prompts quote cleanly. */
function collapse(text) {
  return String(text).replace(/\n{3,}/g, '\n\n').trim();
}

function writeShellScript(file, sessionId, commands) {
  const header = [
    '#!/usr/bin/env bash',
    '#',
    `# Terminal commands captured from Copilot session ${sessionId}.`,
    `# Generated by Session Keeper on ${new Date().toISOString()}.`,
    '# Review before running — commands are reproduced verbatim.',
    '',
    'set -euo pipefail',
    '',
  ];
  const body = commands.map((c) => {
    const lines = [];
    if (c.goal) lines.push(`# ${c.goal}`);
    if (c.explanation && c.explanation !== c.goal) lines.push(`# ${c.explanation}`);
    lines.push(c.command);
    lines.push('');
    return lines.join('\n');
  });
  fs.writeFileSync(file, header.join('\n') + body.join('\n'), 'utf8');
}

function writeCommandsMarkdown(file, sessionId, commands, files) {
  const out = [];
  out.push(`# Session ${sessionId}`);
  out.push('');
  out.push(`_Captured ${new Date().toISOString()} — ${commands.length} commands._`);
  out.push('');
  out.push('## Terminal commands');
  out.push('');
  commands.forEach((c, i) => {
    out.push(`### ${i + 1}. ${c.goal || 'command'}`);
    if (c.explanation && c.explanation !== c.goal) out.push(`> ${c.explanation}`);
    out.push('');
    out.push('```bash');
    out.push(c.command);
    out.push('```');
    out.push('');
  });
  if (files.length) {
    out.push('## Files created / edited');
    out.push('');
    for (const f of files) out.push(`- ${f}`);
    out.push('');
  }
  fs.writeFileSync(file, out.join('\n'), 'utf8');
}

/** Writes the agent's captured thinking/reasoning, in order, with brief context. */
function writeThinkingMarkdown(file, sessionId, thoughts) {
  const out = [];
  out.push(`# Thinking — session ${sessionId}`);
  out.push('');
  out.push(`_Captured ${new Date().toISOString()} — ${thoughts.length} reasoning blocks._`);
  out.push('');
  out.push(
    '> Reasoning text as emitted by the model during this session, in order.',
  );
  out.push('');
  thoughts.forEach((t, i) => {
    out.push(`## ${i + 1}.${t.ts ? ` (${new Date(t.ts).toISOString()})` : ''}`);
    out.push('');
    out.push(t.reasoning);
    out.push('');
    if (t.text) {
      out.push('<sub>Followed by:</sub>');
      out.push('');
      out.push(`> ${truncate(t.text, 280).replace(/\n+/g, ' ')}`);
      out.push('');
    }
  });
  fs.writeFileSync(file, out.join('\n'), 'utf8');
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Ignore the (potentially large) raw logs by default; keep extracted commands. */
function ensureGitignore(outRoot) {
  const gi = path.join(outRoot, '.gitignore');
  if (fs.existsSync(gi)) return;
  fs.writeFileSync(
    gi,
    [
      '# Raw Copilot debug logs can be large; ignored by default.',
      '# Remove the next line if you want to commit full session logs.',
      'logs/',
      '',
      '# Extracted commands/ and thinking/ are intentionally tracked.',
      '',
    ].join('\n'),
    'utf8',
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    const timer = setTimeout(() => resolve(data), 1000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (data += d));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function safeJson(s) {
  if (typeof s !== 'string') return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function safeExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function safeReaddir(p) {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function safeMtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function rel(root, p) {
  return path.relative(root, p).split(path.sep).join('/');
}

/** Emits the hook's JSON result and exits 0 (never block the session). */
function done(cont, message) {
  process.stdout.write(
    JSON.stringify({ continue: cont, systemMessage: message }),
  );
  process.exit(0);
}
