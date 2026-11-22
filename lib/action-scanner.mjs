import { analyzeSource } from './lexer.mjs';

/**
 * Finds a real `'use server'` directive in string literals (ignoring comments).
 * Returns the directive metadata `{ line, start, end }` or null.
 */
export function findUseServerDirective(sourceText, analyzed = null) {
  const ctx = analyzed || analyzeSource(sourceText);
  for (const lit of ctx.stringLiterals) {
    if (lit.value === 'use server') {
      return { line: lit.line, start: lit.start, end: lit.end };
    }
  }
  return null;
}

/**
 * Checks if a file containing a `'use server'` Server Action calls any Next.js
 * cache invalidation API: `revalidateTag()`, `revalidatePath()`, `updateTag()`,
 * or `refresh()`.
 *
 * Uses lexed `codeOnly` so comments like `// revalidateTag('x')` never suppress
 * the finding.
 */
export function checkMissingInvalidation(sourceText, analyzed = null) {
  const ctx = analyzed || analyzeSource(sourceText);
  const directive = findUseServerDirective(sourceText, ctx);
  if (!directive) return null;

  const hasInvalidation = /\b(revalidateTag|revalidatePath|updateTag|refresh)\s*\(/.test(ctx.codeOnly);
  if (hasInvalidation) return null;

  return {
    ruleId: 'CI002',
    type: 'possible-missing-invalidation',
    line: directive.line,
    column: 1,
    message:
      "This file has a Server Action ('use server') but no revalidateTag(), revalidatePath(), or updateTag() call. " +
      'If this action mutates data, cached routes/tags may remain stale afterward.',
    suggestion: "Call revalidatePath('/path') or revalidateTag('tag') after mutating data.",
    severity: 'medium',
  };
}
