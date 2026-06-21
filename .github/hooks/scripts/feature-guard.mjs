#!/usr/bin/env node
/**
 * Feature Guard — end-of-session docs/tests enforcement.
 *
 * Runs as a Copilot `Stop` hook (and can be run manually). It inspects the
 * repository's pending git changes and, if source code changed in this session
 * without a matching update under `docs/features/` (feature-docs skill) and/or
 * a test file (feature-tests skill), it asks the agent to finish the job before
 * stopping.
 *
 * Protocol (mirrors the session-keeper hook):
 *   - stdin: the hook's JSON payload (may include `stop_hook_active`).
 *   - stdout (one of):
 *       { "decision": "block", "reason": "<what to do>" }   // keep working
 *       { "continue": true, "systemMessage": "<note>" }      // all good / skip
 *
 * It is deliberately defensive: any failure resolves to a non-blocking result
 * so it can never wedge a chat session, and it never blocks twice in a row
 * (guarded by `stop_hook_active`) so it cannot loop.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

main();

async function main() {
  try {
    const input = safeJson(await readStdin()) ?? {};

    // Never block on a re-entry: if we already blocked once this turn, let the
    // session stop so we can't loop forever.
    if (input.stop_hook_active === true) {
      return done({ continue: true });
    }

    const root = resolveWorkspace(input);
    const changed = gitChangedFiles(root);
    if (changed.length === 0) {
      return done({ continue: true }); // nothing changed → nothing to enforce
    }

    const srcChanged = changed.filter(isSource);
    if (srcChanged.length === 0) {
      return done({ continue: true }); // only docs/tests/config touched
    }

    const docsChanged = changed.some(isFeatureDoc);
    const testsChanged = changed.some(isTest);

    const missing = [];
    if (!docsChanged) missing.push('feature-docs');
    if (!testsChanged) missing.push('feature-tests');

    if (missing.length === 0) {
      return done({
        continue: true,
        systemMessage: 'Feature Guard: docs + tests updated alongside code. ✔',
      });
    }

    const reason = buildReason(missing, srcChanged);
    return done({ decision: 'block', reason });
  } catch (err) {
    // Any unexpected error must not break the session.
    return done({
      continue: true,
      systemMessage: `Feature Guard skipped: ${String(err && err.message ? err.message : err)}`,
    });
  }
}

/** Classifies a workspace-relative path as buildable source (not docs/tests). */
function isSource(file) {
  const f = file.replace(/\\/g, '/');
  if (isTest(f) || isFeatureDoc(f)) return false;
  // User-facing source trees across the workspace.
  const inTree =
    /^core\/src\//.test(f) ||
    /^data\/src\//.test(f) ||
    /^desktop\/src-tauri\/src\//.test(f) ||
    /^web\/src\//.test(f) ||
    /^proxy\/src\//.test(f);
  if (!inTree) return false;
  // Only count real code files.
  return /\.(rs|ts|tsx|js|jsx)$/.test(f);
}

/** True for any test file (Rust or frontend). */
function isTest(file) {
  const f = file.replace(/\\/g, '/');
  return (
    /(^|\/)__tests__\//.test(f) ||
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f) ||
    /^core\/tests\//.test(f) ||
    /_tests?\.rs$/.test(f) ||
    /(^|\/)tests?\.rs$/.test(f)
  );
}

/** True for the human-readable feature/bugfix docs maintained by feature-docs. */
function isFeatureDoc(file) {
  const f = file.replace(/\\/g, '/');
  return /^docs\/features\//.test(f) || /^docs\/TESTING\.md$/.test(f);
}

function buildReason(missing, srcChanged) {
  const sample = srcChanged.slice(0, 8).map((f) => `  - ${f}`).join('\n');
  const more =
    srcChanged.length > 8 ? `\n  …and ${srcChanged.length - 8} more` : '';
  const parts = [
    'Source code changed this session but the required follow-ups are missing.',
    `Changed source files:\n${sample}${more}`,
    '',
    'Before stopping, complete the skills below, then finish:',
  ];
  if (missing.includes('feature-docs')) {
    parts.push(
      '• feature-docs — create/update a page under docs/features/<slug>.md ' +
        '(Summary, Status + date, How to use, Source links) and prepend a dated ' +
        'entry to docs/features/README.md.',
    );
  }
  if (missing.includes('feature-tests')) {
    parts.push(
      '• feature-tests — add/update tests in the right layer, run the affected ' +
        'suite to prove they pass, and refresh docs/TESTING.md.',
    );
  }
  parts.push(
    '',
    'If this change is purely internal (refactor/format/test-only) with no ' +
      'user-visible effect, note it in the docs/features/README.md changelog ' +
      'instead and you may then stop.',
  );
  return parts.join('\n');
}

/** Lists pending changes (staged, unstaged, untracked) as workspace-relative paths. */
function gitChangedFiles(root) {
  let out = '';
  try {
    out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return [];
  }
  const files = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // Porcelain v1: "XY <path>" or "XY <old> -> <new>" for renames.
    let p = line.slice(3).trim();
    const arrow = p.indexOf(' -> ');
    if (arrow !== -1) p = p.slice(arrow + 4);
    p = p.replace(/^"(.*)"$/, '$1'); // unquote paths with special chars
    if (p) files.add(p.replace(/\\/g, '/'));
  }
  return [...files];
}

function resolveWorkspace(input) {
  const candidate =
    input.workspaceFolder ||
    input.workspaceRoot ||
    input.cwd ||
    process.env.WORKSPACE_FOLDER ||
    process.cwd();
  // Walk up to the nearest git root if possible; fall back to candidate.
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: candidate,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (top) return top;
  } catch {
    /* not a git repo or git missing → use candidate */
  }
  return path.resolve(candidate);
}

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

/** Emits the hook's JSON result and exits 0 (never hard-fails the session). */
function done(result) {
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}
