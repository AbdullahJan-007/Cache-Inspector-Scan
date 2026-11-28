# Technical Design: `cache-inspector-scan`

## 1. Lexer (`lib/lexer.mjs`)

`analyzeSource(source)` runs a single `O(n)` pass over JS/TS/JSX source code without external parsers.

- **Length invariant**: `codeOnly.length === source.length`, with every `\n` kept at its original index so offsets map cleanly to line and column numbers.
- **Masking rules**:
  - `// ...` and `/* ... */` comments are replaced with spaces (preserving newlines) and stored in `comments[]` for inline suppression parsing.
  - `'...'` and `"..."` strings keep their quote delimiters while their interiors are masked; exact values and line numbers are stored in `stringLiterals[]` for `'use client'`, `'use server'`, and `'use cache'` directive checks.
  - Template literals (`` `...` ``) mask static text while tracking nested `${ ... }` expressions on `templateBraceStack` so parentheses inside interpolations still balance properly.
  - Regex literals (`/.../`) are distinguished from division using the preceding non-whitespace character or keyword.
- **Line lookup**: `buildLineIndex()` records each line start once; `offsetToLineColumn()` uses binary search (`O(log L)`), avoiding `O(n^2)` behavior on files with many calls.

## 2. Scan Result Schema (`schemaVersion: "2.0.0"`)

```json
{
  "schemaVersion": "2.0.0",
  "targetDir": "/abs/canonical/path",
  "nextVersion": 15,
  "nextVersionInfo": {
    "major": 15,
    "minor": 2,
    "patch": 0,
    "raw": "15.2.0",
    "source": "node_modules"
  },
  "configFile": ".cacheinspectorrc.json",
  "failOn": "high",
  "rootsScanned": ["app", "lib"],
  "filesScanned": 12,
  "filesSkipped": [],
  "summary": { "high": 1, "medium": 1, "low": 0, "total": 2 },
  "findings": [
    {
      "file": "app/page.tsx",
      "ruleId": "CI001",
      "type": "missing-cache-option",
      "line": 4,
      "column": 15,
      "endLine": 4,
      "endColumn": 52,
      "snippet": "fetch('https://api.example.com/posts')",
      "message": "Next.js 15: a fetch() with no cache option is NOT cached by default...",
      "suggestion": "Add `{ cache: 'force-cache' }`, `{ next: { revalidate: 60 } }`, or `{ cache: 'no-store' }`.",
      "severity": "high"
    }
  ]
}
```

## 3. CLI Exit Codes

| Code | Meaning |
|---|---|
| `0` | Scan succeeded with no findings at or above `--fail-on`. |
| `1` | Scan succeeded with at least one finding at or above `--fail-on`. |
| `2` | Invalid CLI flag, invalid JSON config, missing path, or target is not a directory. |

## 4. LSP Server (`lib/lsp-server.mjs`)

- Parses `Content-Length: <bytes>\r\n\r\n<utf8-json>` frames from a binary `Buffer` so multi-byte characters and split chunks are handled safely.
- Advertises `textDocumentSync: 1` (Full) and `codeActionProvider: true`.
- Publishes `textDocument/publishDiagnostics` on `didOpen`, `didChange`, and `didSave`, and clears diagnostics on `didClose`.
- Tracks document buffers in memory to supply context for `textDocument/codeAction` requests.
- Returns targeted `quickfix` Code Actions powered by `getFixesForFinding()`, allowing 1-click fixes for `CI001` and `CI004` alongside ignore comments.

## 5. Autofix Engine (`lib/autofix.mjs`)

`getFixesForFinding(sourceText, finding)` and `applyFix(sourceText, fix)` generate syntax-preserving source code transformations:

- **CI001 (Missing fetch cache option)**:
  - Parses top-level arguments within balanced parentheses using `codeOnly`.
  - For single-argument `fetch(url)`: Inserts `, { cache: 'no-store' }` (preferred) or `, { next: { revalidate: 60 } }` before the closing parenthesis.
  - For `fetch(url, {})` (empty object): Replaces inner whitespace with ` cache: 'no-store' `.
  - For `fetch(url, { headers: ... })`: Prepends the property into the existing object literal, preserving indentation.
  - For non-literal identifiers (e.g., `fetch(url, customOpts)`): Refrains from mutating variable expressions and safely offers line suppression.
- **CI004 (Route handler GET caching)**:
  - Inserts `export const dynamic = 'force-static';\n` (preferred) or `export const dynamic = 'force-dynamic';\n` directly above the `GET` handler export.

## 6. Security Controls (`lib/security.mjs`)

- **Path traversal & symlink escape (CWE-22 / CWE-59)**: Directory and file entries are checked with `entry.isSymbolicLink()`, `lstatSync()`, and `realpathSync()` root containment.
- **Resource limits (CWE-400)**: Enforces `MAX_FILE_SIZE_BYTES = 1 MiB`, `MAX_FILES = 10,000`, and `MAX_DEPTH = 32`.
- **Terminal escape injection (CWE-150)**: `sanitizeForTerminal()` strips CSI, OSC, DCS, and C0/C1 control characters from untrusted file paths and snippets before printing.
- **Prototype pollution (CWE-1321)**: `safeJsonParse()` strips `__proto__`, `constructor`, and `prototype`; internal counters use `Object.create(null)`.
