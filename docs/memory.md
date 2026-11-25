# Engineering Decisions & Security Audit

## Architecture Decision Records

### ADR-001: Zero-Dependency Lexer Instead of Regex or Full Compiler AST
- **Context**: v1.0.0 relied on regexes and raw parenthesis counting, which broke on `)` inside strings/comments and false-positived on commented `fetch()` calls, member `.fetch()` calls, and `'use client'` files. Adding `typescript` or `@babel/parser` would add 10-40 MB of dependencies.
- **Decision**: Implement a single-pass `O(n)` JS/TS/JSX lexer (`lib/lexer.mjs`) with an `O(log L)` line-offset index.
- **Result**: Zero runtime dependencies, ~21.7 kB npm package, and <50ms scan time for 2,000 `fetch()` calls.

### ADR-002: Shared Core Across CLI, SDK, LSP, and IDE Extension
- **Context**: Supporting both VS Code-compatible IDEs (old and current) and non-VS Code editors across Windows, macOS, and Linux without duplicating rules.
- **Decision**:
  1. Ship a pure-JS VS Code / Open VSX extension (`extension/`) targeting `engines.vscode: ^1.60.0` with no native binaries.
  2. Ship a stdio JSON-RPC 2.0 LSP server (`bin/lsp.mjs`) inside the npm package for Neovim, JetBrains (LSP4IJ), Sublime Text, Helix, and Emacs.
- **Result**: All rules live in `lib/rules.mjs`; updates propagate identically to every surface.

### ADR-003: JSON-Only Config
- **Context**: Executing arbitrary `.js`/`.mjs` config files from untrusted repositories in CI or on editor open is an RCE vector.
- **Decision**: Support `.cacheinspectorrc.json` / `cache-inspector.config.json` only, parsed with prototype-pollution stripping.

## Bugs Fixed in v2.0.0

1. Balanced-paren scanning now ignores `)` inside strings, comments, template literals, and regexes.
2. Skipped `'use client'` files and `pages/` for App Router server `fetch()` rules.
3. Filtered out commented `fetch()` calls and member `client.fetch()` calls.
4. Respected route segment config (`export const dynamic`, `revalidate`, `fetchCache`) and `'use cache'`.
5. Validated `targetDir` existence and directory type so bad paths exit with code `2`.
6. Added upward monorepo search (up to 5 levels) for hoisted `node_modules/next/package.json`.
7. Normalized all output paths to POSIX `/` across Windows, macOS, and Linux.
8. Used `realpathSync` in `bin/cli.mjs` direct-run detection so global/npx symlinks work on macOS and Linux.
9. Added `main`, `types`, `exports`, `lib/index.mjs`, and `types/index.d.ts`.

## Security Audit & Mitigations

All findings below are covered by automated tests in `test/security-redteam.test.mjs`.

| ID | Issue | Severity | Mitigation |
|---|---|---|---|
| S1 | Symlink escape / reading files outside workspace | High | Skip symlinks (`isSymbolicLink` + `lstatSync`) and verify `realpathSync` containment in `lib/walk.mjs` and `lib/security.mjs` |
| S2 | Memory or stack exhaustion on large or deeply nested repos | High | Enforce `MAX_FILE_SIZE_BYTES = 1 MiB`, `MAX_FILES = 10,000`, `MAX_DEPTH = 32` |
| S3 | Terminal ANSI / OSC escape injection (CWE-150) | Medium | Strip CSI/OSC/control sequences via `sanitizeForTerminal()` before printing paths or snippets |
| S4 | `O(n^2)` CPU blowup on files with many `fetch()` calls | Medium | Precompute `lineStarts` and use `O(log L)` binary search in `lib/lexer.mjs` |
| S5 | Prototype pollution via untrusted JSON | Medium | Strip `__proto__`, `constructor`, `prototype` in `safeJsonParse()`; use `Object.create(null)` for counters |
| S6 | Path traversal in `.cacheinspectorrc.json` `roots` | Medium | Reject absolute paths and `..` segments in `lib/config.mjs` |
| S7 | Passing a regular file as scan target | Low | Validate `statSync().isDirectory()` and throw `ScanError('ENOTDIR')` |
