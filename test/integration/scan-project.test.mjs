import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanProject } from '../../lib/scan.mjs';

function makeTempProject(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ci-scan-int-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  return dir;
}

test('integration: scans a realistic Next.js 15 project with mixed rules', () => {
  const dir = makeTempProject({
    'package.json': JSON.stringify({ dependencies: { next: '^15.2.0' } }),
    'app/page.tsx': `export default async function Home() { await fetch('https://api.example.com/posts'); return null; }`,
    'app/client-btn.tsx': `'use client';\nexport function Btn() { fetch('/api/click'); return null; }`,
    'app/actions.ts': `'use server';\nexport async function savePost() { return true; }`,
    'app/api/items/route.ts': `export async function GET() { return Response.json([]); }`,
  });

  try {
    const res = scanProject(dir);
    assert.equal(res.nextVersion, 15);
    assert.equal(res.filesScanned, 4);
    const ids = res.findings.map((f) => f.ruleId).sort();
    assert.deepEqual(ids, ['CI001', 'CI002', 'CI004']);
    // Client component must NOT be flagged
    assert.equal(res.findings.some((f) => f.file.includes('client-btn')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('integration: detects hoisted node_modules/next in a monorepo', () => {
  const monoRoot = makeTempProject({
    'node_modules/next/package.json': JSON.stringify({ name: 'next', version: '16.1.0' }),
    'apps/web/package.json': JSON.stringify({ name: 'web', dependencies: { next: 'workspace:*' } }),
    'apps/web/src/app/page.tsx': `export default async function Page() { await fetch('https://api.example.com'); }`,
  });

  try {
    const res = scanProject(path.join(monoRoot, 'apps', 'web'));
    assert.equal(res.nextVersion, 16);
    assert.equal(res.nextVersionInfo.raw, '16.1.0');
    assert.equal(res.nextVersionInfo.source, 'node_modules');
    assert.equal(res.findings.length, 1);
    assert.equal(res.findings[0].severity, 'high');
  } finally {
    rmSync(monoRoot, { recursive: true, force: true });
  }
});

test('integration: respects .cacheinspectorrc.json ignore and rule overrides', () => {
  const dir = makeTempProject({
    'package.json': JSON.stringify({ dependencies: { next: '15.0.0' } }),
    '.cacheinspectorrc.json': JSON.stringify({
      ignore: ['app/legacy'],
      rules: { CI002: 'off' },
      failOn: 'medium',
    }),
    'app/legacy/old.tsx': `export default async function Old() { await fetch('https://old.example.com'); }`,
    'app/actions.ts': `'use server';\nexport async function doWork() {}`,
    'app/page.tsx': `export default async function Page() { await fetch('https://api.example.com', { cache: 'no-store' }); }`,
  });

  try {
    const res = scanProject(dir);
    assert.equal(res.configFile, '.cacheinspectorrc.json');
    assert.equal(res.failOn, 'medium');
    assert.equal(res.findings.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
