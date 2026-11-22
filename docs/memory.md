# Engineering Memory & Decision Log — `cache-inspector-scan`

## Architecture Decision Records (ADRs)

### ADR-001: Zero-Dependency Single-Pass Lexer over Regex or Babel/TS Compiler
- **Context**: v1.0.0 used naive regex + raw parenthesis counting, which broke on `)` inside strings/comments and false-positived on commented `fetch()` calls, member `.fetch()` calls, and `'use client'` files. Pulling in `@babel/parser` or `typescript` would add 10–40 MB of dependencies and break the zero-dependency value proposition.
- **Decision**: Build a compact, single-pass $O(N)$ JS/TS/JSX lexer (`lib/lexer.mjs`) with $O(\log L)$ binary-search line/column mapping.
- **Consequence**: 0 dependencies, <40ms for 2,000 `fetch()` calls, accurate string/comment/template/regex masking.

### ADR-002: Universal Cross-IDE Strategy (VS Code Extension + Pure Stdio LSP)
- **Context**: Users need the extension to work across **all IDEs (old and latest)** and **all OSes (Windows, macOS, Linux)**.
- **Decision**:
  1. Ship a pure-JS VS Code / Open VSX extension (`extension/`) targeting `engines.vscode: ^1.60.0` with zero native binaries.
  2. Ship a zero-dependency JSON-RPC 2.0 LSP server (`bin/lsp.mjs` / `cache-inspector-lsp`) directly inside the npm package for Neovim, JetBrains (LSP4IJ), Sublime Text, Zed, Helix, and Emacs.
- **Consequence**: Single core engine powers CLI, programmatic API, VS Code family, and every LSP-capable editor on every OS.

### ADR-003: JSON-Only Config (No JS Config Execution)
- **Context**: Running `import(userConfig.mjs)` on untrusted repositories in CI or IDE auto-scan is a remote code execution (RCE) vector.
- **Decision**: Support `.cacheinspectorrc.json` / `cache-inspector.config.json` only, parsed via `safeJsonParse` with prototype-pollution stripping.

---

## Bugs Fixed from v1.0.0 → v2.0.0

1. **Broken paren matching on strings/comments**: `fetch('https://x.com/a)b', { cache: 'no-store' })` previously failed to find `cache: 'no-store'`. Fixed via `lib/lexer.mjs`.
2. **False positives on `'use client'` and `pages/`**: Server-side Next.js `fetch()` cache rules no longer fire on browser Client Components or Pages Router files.
3. **False positives on commented `fetch()` and `client.fetch()`**: Filtered via masked code and preceding-token inspection.
4. **Ignored route segment config**: Files with `export const dynamic`, `export const revalidate`, or `export const fetchCache` are now respected.
5. **Missing `targetDir` validation**: Nonexistent paths or files previously exited `0` with `0 files scanned`; now throw `ScanError` and exit `2`.
6. **Monorepo Next.js version detection**: Added bounded upward traversal (up to 5 parent directories) to find hoisted `node_modules/next/package.json`.
7. **Windows backslash paths**: Normalized all output paths to POSIX `/` for deterministic snapshots, SARIF URIs, and IDE links.
8. **Global/npx symlink CLI execution bug**: `bin/cli.mjs` uses `realpathSync` when checking direct execution so symlinked global bins on macOS/Linux execute properly.
9. **Missing npm programmatic API & TypeScript types**: Added `main`, `types`, `exports`, `lib/index.mjs`, and `types/index.d.ts`.

---

## Red-Team Security Audit Findings & Mitigations

| ID | Vulnerability | Severity | Mitigation Implemented | Verification |
|---|---|---|---|---|
| S1 | Symlink Escape / Arbitrary File Read outside workspace | High | `entry.isSymbolicLink()` + `lstatSync` + `realpathSync` root containment in `lib/walk.mjs` & `lib/security.mjs` | `RED-TEAM S1` test |
| S2 | Resource Exhaustion / OOM on huge or deeply nested repos | High | `MAX_FILE_SIZE_BYTES=1MiB`, `MAX_FILES=10000`, `MAX_DEPTH=32` with `filesSkipped` reporting | `RED-TEAM S2` test |
| S3 | Terminal Escape / ANSI / OSC Injection (CWE-150) | Medium | `sanitizeForTerminal()` strips CSI/OSC/control chars from all untrusted paths and snippets | `RED-TEAM S3` test |
| S4 | $O(N^2)$ CPU DoS via repeated `slice().split('\n')` | Medium | Precomputed `lineStarts` array + binary search $O(\log L)$ in `lib/lexer.mjs` | `RED-TEAM S4` test (36ms for 2,000 calls) |
| S5 | Prototype Pollution via untrusted JSON (`package.json`/config) | Medium | `safeJsonParse()` reviver strips `__proto__`, `constructor`, `prototype`; `Object.create(null)` maps | `RED-TEAM S5` test |
| S6 | Path Traversal in `.cacheinspectorrc.json` `roots` | Medium | Rejects absolute paths and `..` segments in `lib/config.mjs` + root containment in `lib/scan.mjs` | `RED-TEAM S6` test |
| S7 | Unhandled file-as-directory CLI target | Low | `resolveTargetDirectory()` validates `statSync().isDirectory()` and throws `ScanError('ENOTDIR')` | `RED-TEAM S7` test |
