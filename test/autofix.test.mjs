import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSource } from '../lib/scan.mjs';
import { getFixesForFinding, applyFix } from '../lib/autofix.mjs';

test('autofix CI001: single-arg fetch(url) inserts options object and resolves finding', () => {
  const src = `export default async function Page() {\n  const res = await fetch('https://api.example.com/items');\n  return res.json();\n}\n`;
  const findings = scanSource(src, { filePath: 'app/page.tsx', nextVersion: 15 });
  assert.equal(findings.length, 1);

  const fixes = getFixesForFinding(src, findings[0]);
  assert.equal(fixes.length, 3);
  assert.equal(fixes[0].isPreferred, true);
  assert.match(fixes[0].title, /no-store/);
  assert.match(fixes[1].title, /revalidate: 60/);
  assert.match(fixes[2].title, /Ignore CI001/);

  // Applying fix #1 (no-store) produces valid code with 0 findings
  const fixedNoStore = applyFix(src, fixes[0]);
  assert.match(fixedNoStore, /fetch\('https:\/\/api\.example\.com\/items', \{ cache: 'no-store' \}\)/);
  assert.equal(scanSource(fixedNoStore, { filePath: 'app/page.tsx', nextVersion: 15 }).length, 0);

  // Applying fix #2 (revalidate: 60) produces valid code with 0 findings
  const fixedRevalidate = applyFix(src, fixes[1]);
  assert.match(fixedRevalidate, /fetch\('https:\/\/api\.example\.com\/items', \{ next: \{ revalidate: 60 \} \}\)/);
  assert.equal(scanSource(fixedRevalidate, { filePath: 'app/page.tsx', nextVersion: 15 }).length, 0);
});

test('autofix CI001: handles parentheses inside URL string safely', () => {
  const src = `export default async function Page() {\n  await fetch('https://api.example.com/a)b');\n}\n`;
  const [finding] = scanSource(src, { filePath: 'app/page.tsx', nextVersion: 15 });
  const fixes = getFixesForFinding(src, finding);
  const fixed = applyFix(src, fixes[0]);
  assert.match(fixed, /fetch\('https:\/\/api\.example\.com\/a\)b', \{ cache: 'no-store' \}\)/);
  assert.equal(scanSource(fixed, { filePath: 'app/page.tsx', nextVersion: 15 }).length, 0);
});

test('autofix CI001: inserts into existing inline options object (single-line and multi-line)', () => {
  const singleLine = `await fetch(url, { headers: { Authorization: 'Bearer x' } });`;
  const [f1] = scanSource(singleLine, { filePath: 'app/page.tsx', nextVersion: 15 });
  const fixed1 = applyFix(singleLine, getFixesForFinding(singleLine, f1)[0]);
  assert.match(fixed1, /\{ cache: 'no-store', headers:/);
  assert.equal(scanSource(fixed1, { filePath: 'app/page.tsx', nextVersion: 15 }).length, 0);

  const emptyObj = `await fetch(url, {});`;
  const [f2] = scanSource(emptyObj, { filePath: 'app/page.tsx', nextVersion: 15 });
  const fixed2 = applyFix(emptyObj, getFixesForFinding(emptyObj, f2)[0]);
  assert.match(fixed2, /\{ cache: 'no-store' \}/);
  assert.equal(scanSource(fixed2, { filePath: 'app/page.tsx', nextVersion: 15 }).length, 0);
});

test('autofix CI001: does not corrupt non-object 2nd argument variable', () => {
  const src = `await fetch(url, customInitOptions);`;
  const [finding] = scanSource(src, { filePath: 'app/page.tsx', nextVersion: 15 });
  const fixes = getFixesForFinding(src, finding);
  // Only offers safe ignore comment
  assert.equal(fixes.length, 1);
  assert.match(fixes[0].title, /Ignore CI001/);
});

test('autofix CI004: inserts export const dynamic above GET Route Handler and resolves finding', () => {
  const src = `export async function GET() {\n  return Response.json({ ok: true });\n}\n`;
  const [finding] = scanSource(src, { filePath: 'app/api/items/route.ts', nextVersion: 15 });
  assert.equal(finding.ruleId, 'CI004');

  const fixes = getFixesForFinding(src, finding);
  assert.equal(fixes.length, 3);
  const fixed = applyFix(src, fixes[0]);
  assert.match(fixed, /^export const dynamic = 'force-static';\nexport async function GET\(\)/);
  assert.equal(scanSource(fixed, { filePath: 'app/api/items/route.ts', nextVersion: 15 }).length, 0);
});
