import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainDefaultBehavior, severityForMissingCache } from '../lib/next-version.mjs';

test('explains Next.js 14 default as cached', () => {
  assert.match(explainDefaultBehavior(14), /CACHED indefinitely/);
});

test('explains Next.js 15+ default as not cached', () => {
  assert.match(explainDefaultBehavior(15), /NOT cached/);
  assert.match(explainDefaultBehavior(16), /NOT cached/);
});

test('handles an undetectable version without crashing', () => {
  assert.doesNotThrow(() => explainDefaultBehavior(null));
});

test('severity is high on 15+, low on 14 and earlier', () => {
  assert.equal(severityForMissingCache(16), 'high');
  assert.equal(severityForMissingCache(15), 'high');
  assert.equal(severityForMissingCache(14), 'low');
  assert.equal(severityForMissingCache(13), 'low');
  assert.equal(severityForMissingCache(null), 'medium');
});
