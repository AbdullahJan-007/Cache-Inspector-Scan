import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatReport, formatSarif, formatGithub, shouldFail } from '../lib/report.mjs';

const sampleResult = {
  schemaVersion: '2.0.0',
  targetDir: '/tmp/my-next-app',
  nextVersion: 15,
  nextVersionInfo: { major: 15, minor: 2, patch: 0, raw: '15.2.0', source: 'node_modules' },
  rootsScanned: ['app'],
  filesScanned: 2,
  filesSkipped: [],
  summary: { high: 1, medium: 1, low: 0, total: 2 },
  findings: [
    {
      file: 'app/page.tsx',
      ruleId: 'CI001',
      type: 'missing-cache-option',
      line: 4,
      column: 10,
      snippet: "fetch('https://api.example.com')",
      message: 'Next.js 15: not cached by default',
      suggestion: "Add { cache: 'force-cache' }",
      severity: 'high',
    },
    {
      file: 'app/actions.ts',
      ruleId: 'CI002',
      type: 'possible-missing-invalidation',
      line: 1,
      column: 1,
      snippet: "'use server'",
      message: 'No revalidateTag call found',
      severity: 'medium',
    },
  ],
};

test('formatReport produces readable text without ANSI when useColor=false', () => {
  const out = formatReport(sampleResult, { useColor: false });
  assert.match(out, /\[HIGH\] \(CI001\) app\/page\.tsx:4:10/);
  assert.match(out, /\[MEDIUM\] \(CI002\) app\/actions\.ts:1:1/);
  assert.equal(out.includes('\x1b['), false);
});

test('formatSarif produces valid SARIF 2.1.0 JSON', () => {
  const sarif = JSON.parse(formatSarif(sampleResult, '2.0.0'));
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].tool.driver.name, 'cache-inspector-scan');
  assert.equal(sarif.runs[0].results.length, 2);
  assert.equal(sarif.runs[0].results[0].ruleId, 'CI001');
  assert.equal(sarif.runs[0].results[0].level, 'error');
});

test('formatGithub produces GitHub Actions annotation lines', () => {
  const out = formatGithub(sampleResult);
  assert.match(out, /^::error file=app\/page\.tsx,line=4,col=10,title=CI001: missing-cache-option::/m);
  assert.match(out, /^::warning file=app\/actions\.ts,line=1,col=1,title=CI002: possible-missing-invalidation::/m);
});

test('shouldFail respects failOn threshold', () => {
  const mediumOnly = [sampleResult.findings[1]];
  assert.equal(shouldFail(mediumOnly, 'high'), false);
  assert.equal(shouldFail(mediumOnly, 'medium'), true);
  assert.equal(shouldFail(mediumOnly, 'low'), true);
  assert.equal(shouldFail(sampleResult.findings, 'none'), false);
});
