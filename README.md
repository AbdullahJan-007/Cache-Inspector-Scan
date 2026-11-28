# cache-inspector-scan

[![CI](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/actions/workflows/ci.yml/badge.svg)](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/cache-inspector-scan.svg)](https://www.npmjs.com/package/cache-inspector-scan)
[![Open VSX](https://img.shields.io/open-vsx/v/abdullahjan/cache-inspector-vscode)](https://open-vsx.org/extension/abdullahjan/cache-inspector-vscode)

Static analyzer for Next.js App Router caching mistakes. Runs locally with zero dependencies, includes a CLI, ESM/TypeScript API, Language Server (LSP), and an Open VSX editor extension.

## Why

Next.js changed default caching behavior across major versions:

- **Next.js 14 and earlier**: `fetch()` and `GET` Route Handlers were cached by default.
- **Next.js 15 and 16**: Both default to uncached, and new primitives (`'use cache'`, `cacheLife()`, `cacheTag()`, `updateTag()`) introduced new edge cases.

`cache-inspector-scan` detects your installed Next.js version and flags ambiguous or broken caching patterns before they reach production.

## Quick Start

```bash
npx cache-inspector-scan
```

Scan a specific folder (for example in a monorepo):

```bash
npx cache-inspector-scan ./apps/web
```

Or install as a dev dependency:

```bash
npm install -D cache-inspector-scan
```

### Example Output

```text
Cache Inspector scan - /path/to/my-app
Next.js version detected: 15.2.0 (major 15, via node_modules)
Scanned: app, lib  (14 files)

Found 2 issues: 1 high, 1 medium, 0 low

[HIGH] (CI001) app/products/page.tsx:12:15
   fetch('https://api.example.com/products')
   -> Next.js 15: a fetch() with no cache option is NOT cached by default (this changed in Next.js 15).
   Fix: Add `{ cache: 'force-cache' }`, `{ next: { revalidate: 60 } }`, or `{ cache: 'no-store' }`.

[MEDIUM] (CI002) app/products/actions.ts:1:1
   'use server'
   -> This file has a Server Action ('use server') but no revalidateTag(), revalidatePath(), or updateTag() call.
   Fix: Call revalidatePath('/path') or revalidateTag('tag') after mutating data.
```

## Rules

| ID | Name | What it checks |
|---|---|---|
| `CI001` | `missing-cache-option` | Server `fetch()` calls with no `cache` or `next: { revalidate / tags }`. Skips `'use client'`, `pages/`, mutating HTTP methods (`POST`, `PUT`, `DELETE`, `PATCH`), `'use cache'`, and files with segment config (`dynamic`, `revalidate`, `fetchCache`). |
| `CI002` | `possible-missing-invalidation` | Files with `'use server'` that never call `revalidatePath()`, `revalidateTag()`, `updateTag()`, or `refresh()`. |
| `CI003` | `conflicting-cache-options` | `fetch()` calls combining contradictory options such as `cache: 'no-store'` with `next: { revalidate: 60 }`, or `cache: 'force-cache'` with `revalidate: 0`. |
| `CI004` | `route-handler-get-caching` | App Router `route.*` files exporting `GET` without explicit `export const dynamic` or `export const revalidate`. |
| `CI005` | `dynamic-api-with-force-static` | Files exporting `dynamic = 'force-static'` while calling `cookies()`, `headers()`, or `draftMode()`. |
| `CI006` | `use-cache-without-cache-life` | Files using `'use cache'` without `cacheLife()` or `cacheTag()`. |

Full rule details and fix examples: [docs/rules.md](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/blob/main/docs/rules.md)

## CLI Options

```bash
cache-inspector-scan [options] [path]
```

| Option | Description |
|---|---|
| `--format <fmt>` | Output format: `text` (default), `json`, `sarif` (SARIF 2.1.0), or `github` |
| `--json` | Shorthand for `--format json` |
| `--fail-on <level>` | Exit with code `1` at or above: `high` (default), `medium`, `low`, or `none` |
| `--ignore <pattern>` | Ignore files or directories matching pattern (repeatable) |
| `--no-color` | Disable ANSI terminal colors (also respects `NO_COLOR`) |
| `--help, -h` | Print usage |
| `--version, -v` | Print version |

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Scan finished with no findings at or above `--fail-on` |
| `1` | Scan finished with findings at or above `--fail-on` |
| `2` | Invalid arguments, invalid config JSON, or unreadable path |

## Configuration

Create `.cacheinspectorrc.json` (or `cache-inspector.config.json`) in your project root:

```json
{
  "roots": ["app", "src/app", "lib", "src/lib", "actions"],
  "ignore": ["app/legacy"],
  "failOn": "high",
  "rules": {
    "CI002": "low",
    "CI006": "off"
  }
}
```

### Inline Suppressions

```ts
// cache-inspector-ignore-next-line CI001
const res = await fetch('https://api.example.com/health');
```

```ts
// cache-inspector-ignore-file CI002
```

## CI Integration (GitHub Actions)

```yaml
- name: Check Next.js caching
  run: npx cache-inspector-scan --format github --fail-on high
```

For GitHub Code Scanning, pass `--format sarif > results.sarif` and upload with `github/codeql-action/upload-sarif`.

## Programmatic API

Ships as ESM with TypeScript declarations (`types/index.d.ts`):

```ts
import { scanProject, scanSource, getFixesForFinding, applyFix, formatSarif } from 'cache-inspector-scan';

const result = scanProject('./my-next-app');
console.log(result.summary, result.findings);

// In-memory scanning and autofixing
const code = `export default async function Page() { await fetch('/api'); }`;
const findings = scanSource(code, { filePath: 'app/page.tsx', nextVersion: 15 });

if (findings.length > 0) {
  const fixes = getFixesForFinding(code, findings[0]);
  const updatedCode = applyFix(code, fixes[0]);
  console.log(updatedCode);
}
```

## Editor Support

- **VS Code, Cursor, Windsurf, VSCodium, Antigravity, Theia, Gitpod**: Install **Next.js Cache Inspector** (`abdullahjan.cache-inspector-vscode`) from [Open VSX](https://open-vsx.org/extension/abdullahjan/cache-inspector-vscode).
- **Neovim, JetBrains (LSP4IJ), Sublime Text, Helix, Emacs**: This package includes the `cache-inspector-lsp` binary (JSON-RPC 2.0 over stdio). See [editor setup instructions](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/blob/main/extension/README.md).

## Security & Local Execution

- Zero runtime dependencies.
- Reads local files only; makes no network requests.
- Skips symlinks and enforces root containment, file size limits (1 MiB), depth limits (32), ANSI output sanitization, and prototype-pollution-safe JSON parsing.

## Documentation

- [Rules Reference](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/blob/main/docs/rules.md)
- [Architecture](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/blob/main/docs/architecture.md)
- [Technical Design](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/blob/main/docs/design.md)
- [PRD](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/blob/main/docs/PRD.md)
- [Decisions & Security Audit](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/blob/main/docs/memory.md)
- [Changelog](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/blob/main/CHANGELOG.md)
- [Project Tracker](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/blob/main/docs/tracker.md)

## License

MIT
