import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRulesOnSource } from '../lib/rules.mjs';

test('CI001: skips fetch() inside Client Components ("use client")', () => {
  const src = `'use client';\nexport default function C() { fetch('/api/me'); return null; }`;
  const findings = runRulesOnSource({ sourceText: src, relPath: 'app/comp.tsx', nextVersion: 15 });
  assert.equal(findings.length, 0);
});

test('CI001: skips fetch() inside Pages Router files', () => {
  const src = `export default function Home() { fetch('/api/me'); return null; }`;
  const findings = runRulesOnSource({ sourceText: src, relPath: 'pages/index.tsx', nextVersion: 15 });
  assert.equal(findings.length, 0);
});

test('CI001: skips fetch() when route segment config (dynamic/revalidate) is exported', () => {
  const src = `export const dynamic = 'force-dynamic';\nexport default async function Page() { await fetch('https://api.example.com'); }`;
  const findings = runRulesOnSource({ sourceText: src, relPath: 'app/page.tsx', nextVersion: 15 });
  assert.equal(findings.length, 0);
});

test('CI001: ignores commented fetch() and member client.fetch()', () => {
  const src = `
    // fetch('https://api.example.com/commented')
    const msg = "fetch('https://api.example.com/string')";
    await myClient.fetch('https://api.example.com/member');
  `;
  const findings = runRulesOnSource({ sourceText: src, relPath: 'app/page.tsx', nextVersion: 15 });
  assert.equal(findings.length, 0);
});

test('CI001: respects inline cache-inspector-ignore-next-line suppression', () => {
  const src = `
    // cache-inspector-ignore-next-line CI001
    await fetch('https://api.example.com/suppressed');
  `;
  const findings = runRulesOnSource({ sourceText: src, relPath: 'app/page.tsx', nextVersion: 15 });
  assert.equal(findings.length, 0);
});

test('CI002: reports exact line of "use server" and accepts Next 16 updateTag()', () => {
  const flagged = `export async function act() {\n  'use server';\n  await db.insert();\n}`;
  const f1 = runRulesOnSource({ sourceText: flagged, relPath: 'app/actions.ts', nextVersion: 16 });
  assert.equal(f1.length, 1);
  assert.equal(f1[0].ruleId, 'CI002');
  assert.equal(f1[0].line, 2);

  const ok = `'use server';\nimport { updateTag } from 'next/cache';\nexport async function act() { updateTag('posts'); }`;
  const f2 = runRulesOnSource({ sourceText: ok, relPath: 'app/actions.ts', nextVersion: 16 });
  assert.equal(f2.length, 0);
});

test('CI003: flags conflicting cache: no-store + revalidate > 0', () => {
  const src = `await fetch('https://api.example.com', { cache: 'no-store', next: { revalidate: 60 } });`;
  const findings = runRulesOnSource({ sourceText: src, relPath: 'app/page.tsx', nextVersion: 15 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'CI003');
  assert.equal(findings[0].severity, 'high');
});

test('CI004: flags GET Route Handler without dynamic/revalidate config', () => {
  const src = `export async function GET() { return Response.json({ ok: true }); }`;
  const findings = runRulesOnSource({ sourceText: src, relPath: 'app/api/items/route.ts', nextVersion: 15 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'CI004');
  assert.equal(findings[0].severity, 'high');

  const okSrc = `export const dynamic = 'force-static';\nexport async function GET() { return Response.json({ ok: true }); }`;
  const okFindings = runRulesOnSource({ sourceText: okSrc, relPath: 'app/api/items/route.ts', nextVersion: 15 });
  assert.equal(okFindings.length, 0);
});

test('CI005: flags cookies()/headers()/draftMode() combined with force-static', () => {
  const src = `
    import { cookies } from 'next/headers';
    export const dynamic = 'force-static';
    export default async function Page() {
      const c = await cookies();
      return null;
    }
  `;
  const findings = runRulesOnSource({ sourceText: src, relPath: 'app/page.tsx', nextVersion: 15 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'CI005');
  assert.equal(findings[0].severity, 'high');
});

test('CI006: flags "use cache" without cacheLife() or cacheTag()', () => {
  const src = `'use cache';\nexport async function getData() { return fetch('https://api.example.com'); }`;
  const findings = runRulesOnSource({ sourceText: src, relPath: 'lib/data.ts', nextVersion: 16 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'CI006');
  assert.equal(findings[0].severity, 'low');

  const ok = `'use cache';\nimport { cacheLife } from 'next/cache';\nexport async function getData() { cacheLife('hours'); return 1; }`;
  assert.equal(runRulesOnSource({ sourceText: ok, relPath: 'lib/data.ts', nextVersion: 16 }).length, 0);
});

test('ruleOverrides can disable or change severity of rules', () => {
  const src = `await fetch('https://api.example.com');`;
  const disabled = runRulesOnSource({
    sourceText: src,
    relPath: 'app/page.tsx',
    nextVersion: 15,
    ruleOverrides: { CI001: 'off' },
  });
  assert.equal(disabled.length, 0);

  const downgraded = runRulesOnSource({
    sourceText: src,
    relPath: 'app/page.tsx',
    nextVersion: 15,
    ruleOverrides: { CI001: 'low' },
  });
  assert.equal(downgraded[0].severity, 'low');
});
