import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFetchCalls, hasExplicitCacheConfig, isMutatingMethod } from '../lib/fetch-scanner.mjs';

test('finds a simple single-line fetch call', () => {
  const calls = findFetchCalls(`const x = await fetch('/api/data');`);
  assert.equal(calls.length, 1);
  assert.match(calls[0].fullCall, /^fetch\(/);
});

test('finds a multi-line fetch call with a nested options object', () => {
  const src = `
    const res = await fetch('/api/data', {
      cache: 'force-cache',
      headers: { 'X-Test': '1' },
    });
  `;
  const calls = findFetchCalls(src);
  assert.equal(calls.length, 1);
  assert.match(calls[0].fullCall, /cache: 'force-cache'/);
});

test('reports the correct line number', () => {
  const src = `line1\nline2\nconst x = fetch('/api');`;
  const calls = findFetchCalls(src);
  assert.equal(calls[0].lineNumber, 3);
});

test('hasExplicitCacheConfig: true when cache: is present', () => {
  assert.equal(hasExplicitCacheConfig(`fetch(url, { cache: 'no-store' })`), true);
});

test('hasExplicitCacheConfig: true when revalidate: is present', () => {
  assert.equal(hasExplicitCacheConfig(`fetch(url, { next: { revalidate: 60 } })`), true);
});

test('hasExplicitCacheConfig: false with no options at all', () => {
  assert.equal(hasExplicitCacheConfig(`fetch(url)`), false);
});

test("hasExplicitCacheConfig: does not false-positive on a URL that contains the word 'cache'", () => {
  assert.equal(hasExplicitCacheConfig(`fetch('/api/cache-status')`), false);
});

test('isMutatingMethod: true for POST', () => {
  assert.equal(isMutatingMethod(`fetch(url, { method: 'POST' })`), true);
});

test('isMutatingMethod: false when no method given (defaults to GET)', () => {
  assert.equal(isMutatingMethod(`fetch(url)`), false);
});

test('isMutatingMethod: false for an explicit GET', () => {
  assert.equal(isMutatingMethod(`fetch(url, { method: 'GET' })`), false);
});
