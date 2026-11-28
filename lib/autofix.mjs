import { analyzeSource, findMatchingParen, offsetToLineColumn } from './lexer.mjs';

/**
 * Splits top-level comma-separated argument ranges inside `codeOnly` between
 * `openParen + 1` and `closeParen` (respecting nested (), {}, []).
 */
function getTopLevelArgRanges(codeOnly, openParen, closeParen) {
  const ranges = [];
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let argStart = openParen + 1;

  for (let i = openParen + 1; i < closeParen; i++) {
    const ch = codeOnly[i];
    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen--;
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace--;
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket--;
    else if (ch === ',' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      ranges.push({ start: argStart, end: i });
      argStart = i + 1;
    }
  }

  if (argStart < closeParen && codeOnly.slice(argStart, closeParen).trim().length > 0) {
    ranges.push({ start: argStart, end: closeParen });
  }

  return ranges;
}

/**
 * Computes exact, syntax-safe code edits for a given Cache Inspector finding.
 * Each fix returns:
 *   { title, kind: 'quickfix', isPreferred, startOffset, endOffset, newText, startLine, startColumn, endLine, endColumn }
 *
 * Shared by both the VS Code / Open VSX extension and the universal LSP server.
 */
export function getFixesForFinding(sourceText, finding) {
  if (typeof sourceText !== 'string' || !finding) return [];

  const analyzed = analyzeSource(sourceText);
  const { codeOnly, lineStarts } = analyzed;
  const lineIndex = Math.max(0, (finding.line || 1) - 1);
  if (lineIndex >= lineStarts.length) return [];

  const lineStartOffset = lineStarts[lineIndex];
  const lineEndOffset = lineIndex + 1 < lineStarts.length ? lineStarts[lineIndex + 1] : sourceText.length;
  const lineText = sourceText.slice(lineStartOffset, lineEndOffset);
  const indent = (lineText.match(/^[ \t]*/) || [''])[0];
  const ruleId = finding.ruleId || finding.type || 'CI001';
  const fixes = [];

  function makeEdit(title, startOffset, endOffset, newText, isPreferred = false) {
    const startLoc = offsetToLineColumn(lineStarts, startOffset);
    const endLoc = offsetToLineColumn(lineStarts, endOffset);
    return {
      title,
      kind: 'quickfix',
      isPreferred,
      startOffset,
      endOffset,
      newText,
      startLine: startLoc.line,
      startColumn: startLoc.column,
      endLine: endLoc.line,
      endColumn: endLoc.column,
    };
  }

  // --- CI001: Missing fetch() cache option ---
  if (ruleId === 'CI001') {
    const colOffset = Math.max(0, (finding.column || 1) - 1);
    const searchFrom = Math.min(sourceText.length, lineStartOffset + colOffset);
    const openParen = codeOnly.indexOf('(', searchFrom);
    if (openParen !== -1) {
      const closeParen = findMatchingParen(codeOnly, openParen);
      if (closeParen !== -1) {
        const args = getTopLevelArgRanges(codeOnly, openParen, closeParen);

        if (args.length === 1) {
          // Case A: fetch(url) -> insert 2nd options object before ')'
          const insertPos = args[0].end;
          fixes.push(
            makeEdit("Add `{ cache: 'no-store' }` to fetch()", insertPos, insertPos, ", { cache: 'no-store' }", true),
            makeEdit('Add `{ next: { revalidate: 60 } }` to fetch()', insertPos, insertPos, ', { next: { revalidate: 60 } }', false)
          );
        } else if (args.length >= 2) {
          // Case B: fetch(url, { ... }) -> only autofix if 2nd arg is an inline object literal
          const secondArgCode = codeOnly.slice(args[1].start, args[1].end);
          const trimmed = secondArgCode.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            const relOpenBrace = secondArgCode.indexOf('{');
            const absOpenBrace = args[1].start + relOpenBrace;
            const inner = trimmed.slice(1, -1).trim();

            if (inner.length === 0) {
              // Empty object `{}` -> `{ cache: 'no-store' }`
              const absCloseBrace = args[1].start + secondArgCode.lastIndexOf('}');
              fixes.push(
                makeEdit("Add `cache: 'no-store'` to fetch options", absOpenBrace + 1, absCloseBrace, " cache: 'no-store' ", true),
                makeEdit('Add `next: { revalidate: 60 }` to fetch options', absOpenBrace + 1, absCloseBrace, ' next: { revalidate: 60 } ', false)
              );
            } else {
              // Non-empty object `{ headers: ... }` -> insert property after '{'
              const insertPos = absOpenBrace + 1;
              const isMultiline = secondArgCode.includes('\n');
              const prefix = isMultiline ? `\n${indent}  ` : ' ';
              const suffix = isMultiline ? ',' : ',';
              fixes.push(
                makeEdit("Add `cache: 'no-store'` to fetch options", insertPos, insertPos, `${prefix}cache: 'no-store'${suffix}`, true),
                makeEdit('Add `next: { revalidate: 60 }` to fetch options', insertPos, insertPos, `${prefix}next: { revalidate: 60 }${suffix}`, false)
              );
            }
          }
        }
      }
    }
  }

  // --- CI004: GET Route Handler without explicit dynamic/revalidate ---
  if (ruleId === 'CI004') {
    fixes.push(
      makeEdit("Add `export const dynamic = 'force-static'`", lineStartOffset, lineStartOffset, `${indent}export const dynamic = 'force-static';\n`, true),
      makeEdit("Add `export const dynamic = 'force-dynamic'`", lineStartOffset, lineStartOffset, `${indent}export const dynamic = 'force-dynamic';\n`, false)
    );
  }

  // --- Universal fallback: inline ignore comment ---
  fixes.push(
    makeEdit(
      `Ignore ${ruleId} on this line (cache-inspector)`,
      lineStartOffset,
      lineStartOffset,
      `${indent}// cache-inspector-ignore-next-line ${ruleId}\n`,
      false
    )
  );

  return fixes;
}

/**
 * Applies a single fix edit to sourceText and returns the updated string.
 */
export function applyFix(sourceText, fix) {
  return sourceText.slice(0, fix.startOffset) + fix.newText + sourceText.slice(fix.endOffset);
}
