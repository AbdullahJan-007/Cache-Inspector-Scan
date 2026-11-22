# Technical Design Document — `cache-inspector-scan`

## 1. Lexer State Machine (`lib/lexer.mjs`)

To stay **zero-dependency** while eliminating regex fragility, `analyzeSource(source)` performs a single linear $O(N)$ pass:

1. **Invariant**: `codeOnly.length === source.length` and every `\n` is preserved at its exact byte index.
2. **States**:
   - `// ...` single-line comment → masked with spaces; recorded in `comments[]` for suppression parsing.
   - `/* ... */` multi-line comment → masked with spaces (preserving `\n`); recorded in `comments[]`.
   - `'...'` / `"..."` strings → delimiters preserved, interior masked with spaces; exact value & line recorded in `stringLiterals[]` (used to detect real `'use client'`, `'use server'`, `'use cache'` directives).
   - `` `...` `` template literals → static segments masked; `${ ... }` interpolation tracked via `templateBraceStack` so nested objects/calls inside `${...}` remain valid code while surrounding template text cannot break paren balancing.
   - `/.../` regex literals → disambiguated from division via `lastNonWsChar` / `lastNonWsToken` lookbehind heuristics.
3. **Line/Column Index**: `buildLineIndex()` records every `\n` offset once; `offsetToLineColumn()` uses binary search ($O(\log L)$), preventing $O(N^2)$ performance degradation.

## 2. Diagnostic Data Schema (`schemaVersion: "2.0.0"`)

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

## 3. CLI Exit Code Contract

| Exit Code | Condition |
|---|---|
| `0` | Scan succeeded; no findings at or above `--fail-on` threshold. |
| `1` | Scan succeeded; at least one finding at or above `--fail-on` threshold. |
| `2` | Invalid CLI flag, invalid JSON config, missing/unreadable target path, or target is not a directory. |

## 4. LSP Framing & Lifecycle (`lib/lsp-server.mjs`)

- Reads `Content-Length: <bytes>\r\n\r\n<utf8-json>` frames incrementally from a binary `Buffer` (UTF-8 byte-safe, handles multi-byte characters and split TCP/pipe chunks).
- Responds to `initialize` with `textDocumentSync: 1` (Full) and `codeActionProvider: true`.
- Publishes `textDocument/publishDiagnostics` immediately on `didOpen`, `didChange`, `didSave`, and clears diagnostics on `didClose`.
- Provides `quickfix` Code Actions that insert `// cache-inspector-ignore-next-line <ruleId>` cleanly.

## 5. Security Controls Design (`lib/security.mjs`)

- **CWE-22 / CWE-59 (Path Traversal & Symlink Escape)**: Every directory and file entry is checked via `lstatSync` / `entry.isSymbolicLink()` and `realpathSync` root containment.
- **CWE-400 (Resource Exhaustion)**: Enforces `MAX_FILE_SIZE_BYTES = 1 MiB`, `MAX_FILES = 10,000`, `MAX_DEPTH = 32`.
- **CWE-150 (Terminal Escape Injection)**: Strips CSI, OSC, DCS, and C0/C1 control sequences from untrusted file paths and code snippets before printing.
- **CWE-1321 (Prototype Pollution)**: Custom `JSON.parse` reviver strips `__proto__`, `constructor`, and `prototype`; counters use `Object.create(null)`.
