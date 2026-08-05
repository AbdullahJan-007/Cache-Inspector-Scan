import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMissingInvalidation } from '../lib/action-scanner.mjs';

test('flags a Server Action with no invalidation call', () => {
  const src = `'use server';\nexport async function doThing() { await fetch(url); }`;
  const finding = checkMissingInvalidation(src);
  assert.ok(finding);
  assert.equal(finding.severity, 'medium');
});

test('does not flag a Server Action that calls revalidatePath', () => {
  const src = `'use server';\nimport { revalidatePath } from 'next/cache';\nexport async function doThing() { revalidatePath('/x'); }`;
  assert.equal(checkMissingInvalidation(src), null);
});

test('does not flag a file with no Server Action at all', () => {
  assert.equal(checkMissingInvalidation(`export const x = 1;`), null);
});

test('regression: a comment merely mentioning revalidateTag does not count as calling it', () => {
  // This exact bug shipped once — a comment saying "no revalidateTag here"
  // made the old (word-only) regex think it was present.
  const src = `'use server';\n// no revalidateTag / revalidatePath anywhere\nexport async function doThing() {}`;
  const finding = checkMissingInvalidation(src);
  assert.ok(finding, 'should still be flagged — the comment does not count as a real call');
});
