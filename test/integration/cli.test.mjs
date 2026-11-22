import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '..', '..', 'bin', 'cli.mjs');

function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout?.toString('utf8') ?? '',
      stderr: err.stderr?.toString('utf8') ?? '',
    };
  }
}

test('CLI: --version prints semver and exits 0', () => {
  const res = runCli(['--version']);
  assert.equal(res.status, 0);
  assert.match(res.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('CLI: --help prints usage and exits 0', () => {
  const res = runCli(['--help']);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /--format/);
  assert.match(res.stdout, /--fail-on/);
});

test('CLI: rejects unknown flag with exit code 2', () => {
  const res = runCli(['--not-a-real-flag']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Unknown option/);
});

test('CLI: nonexistent path exits with code 2', () => {
  const res = runCli([path.join(os.tmpdir(), 'definitely-does-not-exist-xyz-999')]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Could not scan/);
});

test('CLI: exits 1 on high severity finding and supports --json, --format sarif, --fail-on none', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ci-cli-'));
  mkdirSync(path.join(dir, 'app'), { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '15.3.0' } }));
  writeFileSync(
    path.join(dir, 'app', 'page.tsx'),
    `export default async function Page() { await fetch('https://api.example.com'); }\n`
  );

  try {
    const jsonRes = runCli(['--json', dir]);
    assert.equal(jsonRes.status, 1);
    const parsed = JSON.parse(jsonRes.stdout);
    assert.equal(parsed.summary.high, 1);
    assert.equal(parsed.findings[0].ruleId, 'CI001');

    const sarifRes = runCli(['--format', 'sarif', '--fail-on', 'none', dir]);
    assert.equal(sarifRes.status, 0);
    const sarif = JSON.parse(sarifRes.stdout);
    assert.equal(sarif.version, '2.1.0');
    assert.equal(sarif.runs[0].results.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
