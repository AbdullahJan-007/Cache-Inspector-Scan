/**
 * Lightweight, zero-dependency JS/TS/JSX lexer and code masker.
 *
 * Why a real lexer instead of raw regexes?
 * - Regexes break on parentheses inside strings, template literals, or comments.
 * - Regexes false-positive on commented-out `fetch(...)`, `'use server'`, or
 *   `revalidateTag(...)`.
 * - Precomputed line-start offsets make line/column lookups O(log N) instead of
 *   O(N^2), preventing CPU DoS on large files.
 */

const REGEX_PREV_KEYWORDS = new Set([
  'return',
  'case',
  'throw',
  'in',
  'of',
  'typeof',
  'void',
  'delete',
  'new',
  'await',
  'yield',
  'else',
  'do',
]);

const REGEX_PREV_CHARS = new Set([
  '(',
  '[',
  '{',
  ',',
  ';',
  ':',
  '?',
  '=',
  '!',
  '&',
  '|',
  '^',
  '~',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
]);

/**
 * Builds an array of character indices where each 1-based line begins.
 */
export function buildLineIndex(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * Returns 1-based { line, column } for a character offset in O(log L) time.
 */
export function offsetToLineColumn(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lineStarts[mid] <= offset) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const lineIdx = Math.max(0, lo - 1);
  return {
    line: lineIdx + 1,
    column: offset - lineStarts[lineIdx] + 1,
  };
}

/**
 * Analyzes JS/TS/JSX source code in a single linear O(N) pass.
 * Produces:
 * - `codeOnly`: string of exact same length as `source` where comments,
 *   strings, template literal static parts, and regex bodies are replaced
 *   with spaces (preserving newlines so offsets & line numbers stay identical).
 * - `stringLiterals`: list of `{ value, start, end, line, quote }` for directive detection.
 * - `comments`: list of `{ text, start, end, line, endLine }` for ignore directives.
 * - `lineStarts`: precomputed line offset table.
 */
export function analyzeSource(source) {
  const len = source.length;
  const lineStarts = buildLineIndex(source);
  const out = new Array(len);
  const stringLiterals = [];
  const comments = [];

  // Stack for tracking nested template literal `${ ... }` brace depths
  const templateBraceStack = [];
  let braceDepth = 0;
  let lastNonWsToken = '';
  let lastNonWsChar = '';

  let i = 0;
  while (i < len) {
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : '';

    // 1. Single-line comment // ...
    if (ch === '/' && next === '/') {
      const start = i;
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < len && source[i] !== '\n') {
        out[i] = ' ';
        i++;
      }
      const loc = offsetToLineColumn(lineStarts, start);
      comments.push({
        text: source.slice(start + 2, i),
        start,
        end: i,
        line: loc.line,
        endLine: loc.line,
      });
      continue;
    }

    // 2. Multi-line comment /* ... */
    if (ch === '/' && next === '*') {
      const start = i;
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < len) {
        if (source[i] === '*' && source[i + 1] === '/') {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 2;
          break;
        }
        out[i] = source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      const startLoc = offsetToLineColumn(lineStarts, start);
      const endLoc = offsetToLineColumn(lineStarts, Math.max(start, i - 1));
      comments.push({
        text: source.slice(start + 2, Math.max(start + 2, i - 2)),
        start,
        end: i,
        line: startLoc.line,
        endLine: endLoc.line,
      });
      continue;
    }

    // 3. Single or double quoted string
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      out[i] = quote; // Keep quote delimiters so `cache: '...'` patterns still see string shape
      i++;
      while (i < len) {
        const c = source[i];
        if (c === '\\' && i + 1 < len) {
          out[i] = ' ';
          out[i + 1] = source[i + 1] === '\n' ? '\n' : ' ';
          i += 2;
          continue;
        }
        if (c === quote) {
          out[i] = quote;
          i++;
          break;
        }
        out[i] = c === '\n' ? '\n' : ' ';
        i++;
      }
      const value = source.slice(start + 1, Math.max(start + 1, i - 1));
      const loc = offsetToLineColumn(lineStarts, start);
      stringLiterals.push({ value, start, end: i, line: loc.line, quote });
      lastNonWsChar = quote;
      lastNonWsToken = '';
      continue;
    }

    // 4. Template literal `...`
    if (ch === '`') {
      out[i] = '`';
      i++;
      const res = consumeTemplateSegment(source, out, i, templateBraceStack, braceDepth);
      i = res.nextIndex;
      if (res.enteredInterpolation) braceDepth++;
      lastNonWsChar = '`';
      lastNonWsToken = '';
      continue;
    }

    // 5. Closing `}` that resumes a template literal `${ ... }`
    if (ch === '}' && templateBraceStack.length > 0 && templateBraceStack[templateBraceStack.length - 1] === braceDepth) {
      templateBraceStack.pop();
      braceDepth--;
      out[i] = '}';
      i++;
      const res = consumeTemplateSegment(source, out, i, templateBraceStack, braceDepth);
      i = res.nextIndex;
      if (res.enteredInterpolation) braceDepth++;
      lastNonWsChar = '`';
      lastNonWsToken = '';
      continue;
    }

    // 6. Regex literal heuristic `/.../`
    if (ch === '/' && isRegexStart(lastNonWsChar, lastNonWsToken)) {
      out[i] = ' ';
      i++;
      let inCharClass = false;
      while (i < len) {
        const c = source[i];
        if (c === '\\' && i + 1 < len) {
          out[i] = ' ';
          out[i + 1] = source[i + 1] === '\n' ? '\n' : ' ';
          i += 2;
          continue;
        }
        if (c === '[') inCharClass = true;
        else if (c === ']') inCharClass = false;
        else if (c === '/' && !inCharClass) {
          out[i] = ' ';
          i++;
          while (i < len && /[a-z]/i.test(source[i])) {
            out[i] = ' ';
            i++;
          }
          break;
        } else if (c === '\n') {
          out[i] = '\n';
          i++;
          break;
        }
        out[i] = c === '\n' ? '\n' : ' ';
        i++;
      }
      lastNonWsChar = '/';
      lastNonWsToken = '';
      continue;
    }

    // Regular code character
    out[i] = ch;
    if (ch === '{') braceDepth++;
    else if (ch === '}' && braceDepth > 0) braceDepth--;

    if (!/\s/.test(ch)) {
      if (/[A-Za-z0-9_$]/.test(ch)) {
        if (/[A-Za-z0-9_$]/.test(lastNonWsChar)) {
          lastNonWsToken += ch;
        } else {
          lastNonWsToken = ch;
        }
      } else {
        lastNonWsToken = '';
      }
      lastNonWsChar = ch;
    }
    i++;
  }

  return {
    source,
    codeOnly: out.join(''),
    lineStarts,
    stringLiterals,
    comments,
  };
}

function consumeTemplateSegment(source, out, startIndex, templateBraceStack, currentBraceDepth) {
  const len = source.length;
  let i = startIndex;
  while (i < len) {
    const c = source[i];
    if (c === '\\' && i + 1 < len) {
      out[i] = ' ';
      out[i + 1] = source[i + 1] === '\n' ? '\n' : ' ';
      i += 2;
      continue;
    }
    if (c === '$' && source[i + 1] === '{') {
      out[i] = ' ';
      out[i + 1] = '{';
      templateBraceStack.push(currentBraceDepth + 1);
      return { nextIndex: i + 2, enteredInterpolation: true };
    }
    if (c === '`') {
      out[i] = '`';
      return { nextIndex: i + 1, enteredInterpolation: false };
    }
    out[i] = c === '\n' ? '\n' : ' ';
    i++;
  }
  return { nextIndex: i, enteredInterpolation: false };
}

function isRegexStart(lastChar, lastToken) {
  if (lastChar === '') return true;
  if (REGEX_PREV_CHARS.has(lastChar)) return true;
  if (lastToken && REGEX_PREV_KEYWORDS.has(lastToken)) return true;
  return false;
}

/**
 * Finds the matching closing parenthesis index in `codeOnly` (where strings,
 * comments, and regexes have already been masked out).
 */
export function findMatchingParen(codeOnly, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < codeOnly.length; i++) {
    const ch = codeOnly[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Parses inline suppression comments:
 * - `// cache-inspector-ignore-next-line` or `// cache-inspector-ignore-next-line CI001`
 * - `// cache-inspector-ignore-file`
 */
export function extractSuppressions(comments) {
  let ignoreFile = false;
  const ignoreFileRules = new Set();
  const lineSuppressions = new Map(); // lineNumber -> Set<ruleId | '*'>

  for (const comment of comments) {
    const text = comment.text.trim();
    const fileMatch = text.match(/^cache-inspector-ignore-file(?:\s+([A-Za-z0-9_,-]+))?/);
    if (fileMatch) {
      if (!fileMatch[1]) {
        ignoreFile = true;
      } else {
        for (const r of fileMatch[1].split(',').map((s) => s.trim()).filter(Boolean)) {
          ignoreFileRules.add(r);
        }
      }
      continue;
    }

    const nextLineMatch = text.match(/^cache-inspector-ignore-next-line(?:\s+([A-Za-z0-9_,-]+))?/);
    if (nextLineMatch) {
      const targetLine = comment.endLine + 1;
      if (!lineSuppressions.has(targetLine)) {
        lineSuppressions.set(targetLine, new Set());
      }
      const set = lineSuppressions.get(targetLine);
      if (!nextLineMatch[1]) {
        set.add('*');
      } else {
        for (const r of nextLineMatch[1].split(',').map((s) => s.trim()).filter(Boolean)) {
          set.add(r);
        }
      }
    }
  }

  return {
    isSuppressed(ruleId, line) {
      if (ignoreFile || ignoreFileRules.has(ruleId)) return true;
      if (line == null) return false;
      const set = lineSuppressions.get(line);
      return Boolean(set && (set.has('*') || set.has(ruleId)));
    },
  };
}
