import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanProject } from '../lib/scan.mjs';
import { formatReport } from '../lib/report.mjs';
import { findFetchCalls } from '../lib/fetch-scanner.mjs';
import { sanitizeForTerminal, safeJsonParse, ScanError } from '../lib/security.mjs';

test('RED-TEAM S1: symlink pointing outside target root is skipped (no arbitrary file read)', () => {
  const outsideDir = mkdtempSync(path.join(os.tmpdir(), 'ci-secret-'));
  const secretFile = path.join(outsideDir, 'secret.ts');
  writeFileSync(secretFile, `await fetch('https://secret-internal-token-12345.local');\n`);

  const projectDir = mkdtempSync(path.join(os.tmpdir(), 'ci-proj-'));
  mkdirSync(path.join(projectDir, 'app'), { recursive: true });
  writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0' } }));

  let symlinkCreated = false;
  try {
    symlinkSync(secretFile, path.join(projectDir, 'app', 'leak.ts'));
    symlinkCreated = true;
  } catch {
    // Windows without Developer Mode may forbid creating symlinks; still verify containment logic
  }

  try {
    const res = scanProject(projectDir);
    assert.equal(res.findings.some((f) => (f.snippet || '').includes('secret-internal-token')), false);
    if (symlinkCreated) {
      assert.equal(res.filesSkipped.some((s) => s.reason === 'symlink-skipped'), true);
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  }
});

test('RED-TEAM S2: oversized files (> maxFileSizeBytes) are skipped safely without OOM', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ci-big-'));
  mkdirSync(path.join(dir, 'app'), { recursive: true });
  // Create a 200KB file and set maxFileSizeBytes to 50KB
  writeFileSync(path.join(dir, 'app', 'huge.ts'), 'const a = 1;\n'.repeat(20_000));

  try {
    const res = scanProject(dir, { maxFileSizeBytes: 50_000 });
    assert.equal(res.filesScanned, 0);
    assert.equal(res.filesSkipped.length, 1);
    assert.equal(res.filesSkipped[0].reason, 'file-too-large');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RED-TEAM S3: ANSI / OSC terminal escape injection in snippets & paths is stripped (CWE-150)', () => {
  const malicious = "\x1b]0;PWNED\x07fetch('\x1b[31mFAKE_ERROR\x1b[0m')";
  const cleaned = sanitizeForTerminal(malicious);
  assert.equal(cleaned.includes('\x1b'), false);
  assert.equal(cleaned.includes('PWNED'), false);

  const report = formatReport(
    {
      targetDir: '/tmp/\x1b[31mevil',
      nextVersion: 15,
      rootsScanned: ['app'],
      filesScanned: 1,
      filesSkipped: [],
      findings: [
        {
          file: 'app/\x1b[31mspoof.tsx',
          ruleId: 'CI001',
          type: 'missing-cache-option',
          line: 1,
          column: 1,
          snippet: malicious,
          message: 'msg',
          severity: 'high',
        },
      ],
    },
    { useColor: false }
  );
  assert.equal(report.includes('\x1b'), false);
});

test('RED-TEAM S4: 2,000 fetch() calls in a single file do not trigger O(N^2) CPU DoS', () => {
  const manyFetches = Array.from({ length: 2000 }, (_, i) => `await fetch('/api/item/${i}');`).join('\n');
  const start = performance.now();
  const calls = findFetchCalls(manyFetches);
  const elapsedMs = performance.now() - start;
  assert.equal(calls.length, 2000);
  assert.ok(elapsedMs < 1000, `Expected linear/log scan under 1000ms, took ${elapsedMs.toFixed(1)}ms`);
});

test('RED-TEAM S5: prototype pollution payload in JSON config is neutralized', () => {
  const payload = '{"__proto__":{"polluted":true},"rules":{"CI001":"low"}}';
  const parsed = safeJsonParse(payload);
  assert.equal(({}).polluted, undefined);
  assert.equal(parsed.rules.CI001, 'low');
});

test('RED-TEAM S6: path traversal in .cacheinspectorrc.json roots is rejected', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ci-trav-'));
  writeFileSync(
    path.join(dir, '.cacheinspectorrc.json'),
    JSON.stringify({ roots: ['../../etc', '/etc', 'app'] })
  );
  mkdirSync(path.join(dir, 'app'), { recursive: true });

  try {
    const res = scanProject(dir);
    assert.deepEqual(res.rootsScanned, ['app']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RED-TEAM S7: passing a file path instead of a directory throws typed ScanError', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ci-file-'));
  const file = path.join(dir, 'not-a-dir.txt');
  writeFileSync(file, 'hi');
  try {
    assert.throws(
      () => scanProject(file),
      (err) => err instanceof ScanError && err.code === 'ENOTDIR'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
