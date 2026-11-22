import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSource,
  findMatchingParen,
  offsetToLineColumn,
  extractSuppressions,
} from '../lib/lexer.mjs';

test('masks comments and preserves line count', () => {
  const src = `// fetch('/commented')\n/* fetch('/block') \n still comment */\nconst ok = fetch('/real');`;
  const res = analyzeSource(src);
  assert.equal(res.codeOnly.length, src.length);
  assert.equal(res.codeOnly.split('\n').length, src.split('\n').length);
  assert.equal(res.codeOnly.includes('/commented'), false);
  assert.equal(res.codeOnly.includes('/block'), false);
  assert.match(res.codeOnly, /const ok = fetch\(/);
});

test('handles parentheses inside strings, template literals, and comments', () => {
  const src = `fetch('https://example.com/a)b', { /* ) */ cache: 'no-store' })`;
  const res = analyzeSource(src);
  const openIdx = res.codeOnly.indexOf('(');
  const closeIdx = findMatchingParen(res.codeOnly, openIdx);
  assert.equal(closeIdx, src.length - 1);
});

test('handles nested template literal interpolations', () => {
  const src = 'const res = fetch(`/api/${getId({ a: 1 })}/items)more`, { cache: "force-cache" });';
  const res = analyzeSource(src);
  const openIdx = res.codeOnly.indexOf('(');
  const closeIdx = findMatchingParen(res.codeOnly, openIdx);
  assert.equal(src[closeIdx], ')');
  assert.match(src.slice(openIdx, closeIdx + 1), /force-cache/);
});

test('handles regex literals containing quotes and parens', () => {
  const src = `const r = /foo'bar)baz/g;\nconst x = fetch('/real');`;
  const res = analyzeSource(src);
  assert.match(res.codeOnly, /fetch\(/);
});

test('offsetToLineColumn returns accurate 1-based line and column', () => {
  const src = 'abc\ndefg\nhijkl';
  const { lineStarts } = analyzeSource(src);
  assert.deepEqual(offsetToLineColumn(lineStarts, 0), { line: 1, column: 1 });
  assert.deepEqual(offsetToLineColumn(lineStarts, 4), { line: 2, column: 1 });
  assert.deepEqual(offsetToLineColumn(lineStarts, 6), { line: 2, column: 3 });
  assert.deepEqual(offsetToLineColumn(lineStarts, 9), { line: 3, column: 1 });
});

test('extractSuppressions handles next-line and file-level ignores', () => {
  const src = [
    '// cache-inspector-ignore-next-line CI001',
    'fetch("/api");',
    '// cache-inspector-ignore-next-line',
    'fetch("/api2");',
  ].join('\n');
  const { comments } = analyzeSource(src);
  const sup = extractSuppressions(comments);
  assert.equal(sup.isSuppressed('CI001', 2), true);
  assert.equal(sup.isSuppressed('CI002', 2), false);
  assert.equal(sup.isSuppressed('CI003', 4), true);
});
