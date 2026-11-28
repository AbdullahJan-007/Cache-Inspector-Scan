# Product Requirements: `cache-inspector-scan`

## Overview

`cache-inspector-scan` is a zero-dependency static analyzer for Next.js App Router caching. It runs locally through a CLI, an ESM/TypeScript API, a stdio Language Server (`cache-inspector-lsp`), and a VS Code / Open VSX extension (`abdullahjan.cache-inspector-vscode`).

## Problem

Next.js changed default caching behavior across major versions:

- **Next.js 14 and earlier**: `fetch()` and `GET` Route Handlers cached responses by default.
- **Next.js 15 and 16**: Both default to uncached, and new primitives (`'use cache'`, `cacheLife()`, `cacheTag()`, `updateTag()`) introduced new configuration mistakes when combined with `force-static`, `cookies()`, `headers()`, or Server Actions.

Developers upgrading between versions or copying older examples frequently ship unintended caching behavior without noticing until production traffic hits.

## Users

1. **Next.js Developers**: Need immediate diagnostics and quick fixes inside their editor (VS Code, Cursor, Windsurf, VSCodium, Antigravity, Neovim, JetBrains, Sublime, Helix, Emacs).
2. **CI / Maintainers**: Need deterministic exit codes (`--fail-on`), SARIF 2.1.0 and GitHub Actions output, monorepo support, and `.cacheinspectorrc.json` rules without installing heavy dependencies.
3. **Security-Conscious Teams**: Need offline, read-only scanning with zero third-party packages and protection against malformed repositories.

## Requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-1 | Detect installed Next.js version in `node_modules` (including hoisted monorepos) with `package.json` fallback | P0 | Done |
| FR-2 | Single-pass JS/TS/JSX lexing so strings, comments, template literals, and regexes do not trigger false positives | P0 | Done |
| FR-3 | Six caching rules (`CI001`-`CI006`) aware of `'use client'`, `pages/`, route segment config, and `'use cache'` | P0 | Done |
| FR-4 | Inline suppressions (`cache-inspector-ignore-next-line`, `cache-inspector-ignore-file`) | P0 | Done |
| FR-5 | Output formats: `text`, `json`, `sarif` (2.1.0), and `github` annotations | P0 | Done |
| FR-6 | Project config (`.cacheinspectorrc.json`) for roots, ignores, severity overrides, and `--fail-on` | P1 | Done |
| FR-7 | Typed ESM programmatic API (`lib/index.mjs` and `types/index.d.ts`) | P1 | Done |
| FR-8 | Editor support via Open VSX / VS Code extension (`>=1.60.0`) and stdio LSP (`cache-inspector-lsp`) | P0 | Done |
| FR-9 | Automated 1-click quickfixes (`getFixesForFinding`, `applyFix`) for `CI001` and `CI004` across IDE and LSP | P0 | Done |
| FR-10 | Automated CI matrix (Windows, macOS, Ubuntu x Node 18, 20, 22) and tag-based release workflow | P1 | Done |

## Constraints

- **Zero runtime dependencies**: Installs and runs using Node.js built-ins only (`node >= 18.0.0`).
- **Performance**: Linear `O(n)` lexing and `O(log L)` line lookups; 2,000 `fetch()` calls in one file complete under 100ms.
- **Security**: Symlink skip, root containment checks, 1 MiB file size cap, 10,000 file cap, depth cap of 32, ANSI escape stripping, and safe JSON parsing.
- **Cross-OS**: POSIX-normalized paths and identical behavior on Windows, macOS, and Linux.

## Out of Scope

- Runtime HTTP/CDN header inspection.
- Full TypeScript type-checking (handled by `tsc`).
- Executing JavaScript config files (config is strictly JSON).
