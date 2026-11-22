# Product Requirements Document (PRD) — `cache-inspector-scan`

## 1. Executive Summary

`cache-inspector-scan` is a zero-dependency, local-first static analysis tool, programmatic SDK, Language Server (LSP), and universal IDE extension that detects Next.js App Router caching bugs before they ship to production.

## 2. Problem Statement

Next.js caching semantics changed dramatically between Next.js 14, 15, and 16:
- **Next.js <=14**: `fetch()` and `GET` Route Handlers were cached by default.
- **Next.js 15+**: Both flipped to **uncached by default**, silently breaking performance assumptions for teams migrating or following older tutorials.
- **Next.js 15/16**: Introduced `'use cache'`, `cacheLife()`, `cacheTag()`, and `updateTag()`, adding new failure modes when combined incorrectly with `force-static`, `cookies()`, `headers()`, or Server Actions.

Existing tools either require heavy AST toolchains/Babel configs, lack Next.js version awareness, or cannot run offline in CI and across every IDE/OS.

## 3. Target Personas

1. **Next.js Application Developers**: Want instant squiggly diagnostics and quick fixes inside their IDE (VS Code, Cursor, Windsurf, Neovim, JetBrains, Sublime, Zed, Emacs) regardless of OS or IDE version.
2. **Staff / Platform Engineers**: Want deterministic CI gates (`--fail-on`, `--format sarif`, `--format github`), monorepo support, `.cacheinspectorrc.json` policies, and zero supply-chain bloat.
3. **Security / DevSecOps Teams**: Require 100% local execution, zero network calls, zero third-party dependencies, and defense against malicious repository inputs.

## 4. Functional Requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-1 | Monorepo-aware Next.js version detection (`node_modules` ascent + `package.json` fallback) | P0 | Implemented |
| FR-2 | Lexer-backed JS/TS/JSX parsing (immune to strings, comments, template literals, regexes) | P0 | Implemented |
| FR-3 | 6 production caching rules (`CI001`–`CI006`) aware of `'use client'`, `pages/`, segment config, `'use cache'` | P0 | Implemented |
| FR-4 | Inline suppression comments (`cache-inspector-ignore-next-line`, `cache-inspector-ignore-file`) | P0 | Implemented |
| FR-5 | Multiple output formats: `text`, `json`, `sarif` (2.1.0), `github` annotations | P0 | Implemented |
| FR-6 | Configurable severity overrides, ignore patterns, and `--fail-on` exit thresholds | P1 | Implemented |
| FR-7 | Typed programmatic ESM API (`lib/index.mjs` + `types/index.d.ts`) | P1 | Implemented |
| FR-8 | Universal cross-IDE, cross-OS support via VS Code/Open VSX extension (`>=1.60.0`) + stdio LSP (`cache-inspector-lsp`) | P0 | Implemented |

## 5. Non-Functional Requirements

- **Zero Runtime Dependencies**: No `node_modules` required to install or execute.
- **Performance**: Linear $O(N)$ lexing and $O(\log L)$ line lookups; 2,000 `fetch()` calls scanned in <100ms.
- **Security**: Symlink escape protection, file-size/depth/count limits, ANSI escape sanitization (CWE-150), prototype-pollution-safe JSON parsing.
- **Portability**: Node.js `>=18.0.0`, identical POSIX-normalized output on Windows, macOS, and Linux.

## 6. Non-Goals

- Runtime network interception or live CDN cache header inspection.
- Full TypeScript type-checking (handled by `tsc`).
- Executing user code or arbitrary JS config files (strictly JSON config for security).
