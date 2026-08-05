// Finds fetch(...) calls with a real balanced-parenthesis scan, not a naive
// regex — a naive regex breaks the moment someone's cache options object
// spans multiple lines, which is extremely common.
export function findFetchCalls(sourceText) {
  const calls = [];
  const callRegex = /\bfetch\s*\(/g;
  let match;
  while ((match = callRegex.exec(sourceText)) !== null) {
    const start = match.index;
    const openParenIndex = start + match[0].length - 1;
    const endIndex = findMatchingParen(sourceText, openParenIndex);
    if (endIndex === -1) continue;
    const fullCall = sourceText.slice(start, endIndex + 1);
    const lineNumber = sourceText.slice(0, start).split('\n').length;
    calls.push({ fullCall, lineNumber });
  }
  return calls;
}

function findMatchingParen(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Looks for an actual cache/revalidate *option key*, not just the word
// "cache" anywhere — avoids flagging something like fetch('/api/cache-status').
export function hasExplicitCacheConfig(fullCallText) {
  const hasCacheKey = /\bcache\s*:\s*['"`]/.test(fullCallText);
  const hasRevalidateKey = /\brevalidate\s*:/.test(fullCallText);
  return hasCacheKey || hasRevalidateKey;
}

// GET (the default when no method is given) is what Next.js's fetch
// caching is actually about. A POST/PUT/DELETE/PATCH call missing a cache
// option isn't a caching bug — flagging it as one is wrong advice, not
// just noise.
export function isMutatingMethod(fullCallText) {
  const methodMatch = fullCallText.match(/\bmethod\s*:\s*['"`](\w+)['"`]/i);
  if (!methodMatch) return false;
  return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(methodMatch[1].toUpperCase());
}
