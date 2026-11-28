# Changelog

All notable changes to `cache-inspector-scan` and `abdullahjan.cache-inspector-vscode` are documented in this file.

## [2.1.0] - 2026-11-28 (Extension & Autofix Engine)

### Added
- Shared zero-dependency autofix engine (`lib/autofix.mjs`) exporting `getFixesForFinding()` and `applyFix()`.
- Real code-action autofixes in both the VS Code / Open VSX extension and `cache-inspector-lsp`:
  - `CI001`: Insert `{ cache: 'no-store' }` or `{ next: { revalidate: 60 } }` into `fetch(url)` and `fetch(url, { ... })` calls without corrupting strings or variable arguments.
  - `CI004`: Insert `export const dynamic = 'force-static'` or `export const dynamic = 'force-dynamic'` above `GET` Route Handlers.
- Automated tag-based release workflow (`.github/workflows/release.yml`) supporting npm provenance and Open VSX publishing.

## [2.0.0] - 2026-11-25

### Added
- Single-pass `O(n)` JS/TS/JSX lexer (`lib/lexer.mjs`) with `O(log L)` line/column index and inline suppressions (`cache-inspector-ignore-next-line`, `cache-inspector-ignore-file`).
- Six App Router rules (`CI001`-`CI006`): unconfigured `fetch()`, Server Actions missing invalidation, conflicting cache options, `GET` Route Handler caching, `force-static` + dynamic APIs (`cookies()`, `headers()`, `draftMode()`), and `'use cache'` without `cacheLife()`/`cacheTag()`.
- Output formats: `text`, `json`, `sarif` (2.1.0), and `github` workflow annotations, plus `--fail-on` and `.cacheinspectorrc.json`.
- Programmatic ESM API (`lib/index.mjs`) with TypeScript definitions (`types/index.d.ts`).
- Built-in zero-dependency stdio Language Server (`cache-inspector-lsp`) and Open VSX extension (`abdullahjan.cache-inspector-vscode`, `vscode >= 1.60.0`) with custom 256x256 icon.
- Security guardrails (`lib/security.mjs`): symlink skip, root containment, file size/count/depth limits, ANSI escape sanitization (CWE-150), and prototype-pollution-safe JSON parsing.
- Cross-OS GitHub Actions CI matrix (Ubuntu, macOS, Windows x Node 18, 20, 22).

### Fixed
- Skipped `'use client'` files and `pages/` for App Router server `fetch()` rules.
- Ignored commented `fetch()` calls, member `.fetch()` calls, and parentheses inside strings/comments.
- Added monorepo parent directory search for hoisted `node_modules/next/package.json`.
- Normalized all report paths to POSIX `/` and fixed global symlink CLI execution with `realpathSync`.

## [1.0.0] - Initial Release

- Initial CLI scanning `fetch()` calls and `'use server'` files.
