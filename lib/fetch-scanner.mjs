import { analyzeSource, findMatchingParen, offsetToLineColumn } from './lexer.mjs';

/**
 * Finds real standalone `fetch(...)` calls using the lexical code masker.
 * - Ignores `fetch(` inside comments, strings, template literals, and regexes.
 * - Ignores member calls like `client.fetch(...)` or `axios.fetch(...)`
 *   (except `globalThis.fetch(...)` and `window.fetch(...)`).
 * - Ignores function declarations `function fetch(...)`.
 * - Balanced parentheses never break on `)` inside strings or comments.
 */
export function findFetchCalls(sourceText, analyzed = null) {
  const ctx = analyzed || analyzeSource(sourceText);
  const { source, codeOnly, lineStarts } = ctx;
  const calls = [];
  const callRegex = /\bfetch\s*\(/g;
  let match;

  while ((match = callRegex.exec(codeOnly)) !== null) {
    const start = match.index;

    // Inspect preceding non-whitespace context to filter out `.fetch(` and `function fetch(`
    const before = codeOnly.slice(Math.max(0, start - 32), start);
    if (/(?:function\s+|async\s+function\s+)$/.test(before)) continue;
    if (/\.\s*$/.test(before)) {
      // Allow explicit globalThis.fetch(...)
      if (!/\bglobalThis\s*\.\s*$/.test(before)) continue;
    }

    const openParenIndex = start + match[0].length - 1;
    const endIndex = findMatchingParen(codeOnly, openParenIndex);
    if (endIndex === -1) continue;

    const fullCall = source.slice(start, endIndex + 1);
    const maskedCall = codeOnly.slice(start, endIndex + 1);
    const startLoc = offsetToLineColumn(lineStarts, start);
    const endLoc = offsetToLineColumn(lineStarts, endIndex + 1);

    calls.push({
      fullCall,
      maskedCall,
      start,
      end: endIndex + 1,
      lineNumber: startLoc.line,
      column: startLoc.column,
      endLine: endLoc.line,
      endColumn: endLoc.column,
    });
  }

  return calls;
}

/**
 * Checks whether a fetch(...) call has an explicit cache configuration:
 * - `cache: '...'` (or variable/expression)
 * - `next: { revalidate: ... }` or `revalidate:`
 * - `next: { tags: [...] }`
 * Uses comment/string-stripped code for key detection to prevent false negatives
 * from comments like `// cache: 'no-store'` inside the options object.
 */
export function hasExplicitCacheConfig(fullCallText, maskedCallText = null) {
  const masked = maskedCallText || analyzeSource(fullCallText).codeOnly;
  const hasCacheKey = /\bcache\s*:/.test(masked);
  const hasRevalidateKey = /\brevalidate\s*:/.test(masked);
  const hasTagsKey = /\bnext\s*:\s*\{[\s\S]*?\btags\s*:/.test(masked);
  return hasCacheKey || hasRevalidateKey || hasTagsKey;
}

/**
 * Detects conflicting cache options in a single fetch() call:
 * - `cache: 'no-store'` combined with `revalidate: <positive number>`
 * - `cache: 'force-cache'` combined with `revalidate: 0`
 */
export function detectConflictingCacheConfig(fullCallText, maskedCallText = null) {
  const masked = maskedCallText || analyzeSource(fullCallText).codeOnly;
  if (!/\bcache\s*:/.test(masked) || !/\brevalidate\s*:/.test(masked)) {
    return null;
  }

  // Extract actual values from fullCallText only after confirming real keys exist in masked code
  const isNoStore = /\bcache\s*:\s*['"`]no-store['"`]/.test(fullCallText);
  const isForceCache = /\bcache\s*:\s*['"`]force-cache['"`]/.test(fullCallText);
  const revMatch = fullCallText.match(/\brevalidate\s*:\s*(\d+|false)/);

  if (!revMatch) return null;
  const revVal = revMatch[1] === 'false' ? false : Number.parseInt(revMatch[1], 10);

  if (isNoStore && typeof revVal === 'number' && revVal > 0) {
    return "Conflicting fetch() options: `cache: 'no-store'` cannot be combined with a positive `next.revalidate` value.";
  }
  if (isForceCache && revVal === 0) {
    return "Conflicting fetch() options: `cache: 'force-cache'` conflicts with `next.revalidate: 0` (which opts out of caching).";
  }
  return null;
}

/**
 * Returns true if the fetch call uses a mutating HTTP method (POST, PUT, DELETE, PATCH).
 */
export function isMutatingMethod(fullCallText, maskedCallText = null) {
  const masked = maskedCallText || analyzeSource(fullCallText).codeOnly;
  if (!/\bmethod\s*:/.test(masked)) return false;
  const methodMatch = fullCallText.match(/\bmethod\s*:\s*['"`]([A-Za-z]+)['"`]/i);
  if (!methodMatch) return false;
  return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(methodMatch[1].toUpperCase());
}
