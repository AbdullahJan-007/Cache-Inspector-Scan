# cache-inspector-scan

> Production-grade **Next.js App Router** caching static analyzer, CLI, programmatic SDK, and universal LSP / IDE extension.
> **Zero dependencies. 100% local. Cross-OS (Windows, macOS, Linux).**

Next.js 15 and 16 flipped default caching behavior for `fetch()` and `GET` Route Handlers and introduced `'use cache'`, `cacheLife()`, `cacheTag()`, and `updateTag()`. `cache-inspector-scan` catches real caching bugs in your codebase before they hit production.

---

## Quick Start

Run directly with `npx` (no installation needed):

```bash
npx cache-inspector-scan
```

Or scan a specific project directory:

```bash
npx cache-inspector-scan ./apps/web
```

Or install as a dev dependency:

```bash
npm install -D cache-inspector-scan
```

---

## Rules Checked (`CI001` – `CI006`)

| Rule | Type | What It Catches |
|---|---|---|
| `CI001` | `missing-cache-option` | Server `fetch()` calls without explicit `cache:` or `next: { revalidate / tags }` (ignores `'use client'`, `pages/`, mutating HTTP methods, and route segment configs). |
| `CI002` | `possible-missing-invalidation` | `'use server'` Server Actions without `revalidatePath()`, `revalidateTag()`, `updateTag()`, or `refresh()`. |
| `CI003` | `conflicting-cache-options` | Contradictory `fetch()` options such as `cache: 'no-store'` combined with `next: { revalidate: 60 }`. |
| `CI004` | `route-handler-get-caching` | App Router `GET` Route Handlers (`route.ts`) without explicit `export const dynamic` or `export const revalidate`. |
| `CI005` | `dynamic-api-with-force-static` | Calling `cookies()`, `headers()`, or `draftMode()` in a file that exports `dynamic = 'force-static'`. |
| `CI006` | `use-cache-without-cache-life` | `'use cache'` directive without explicit `cacheLife()` or `cacheTag()`. |

See [docs/rules.md](./docs/rules.md) for full details and fix examples.

---

## CLI Usage & Options

```bash
cache-inspector-scan [options] [path]
```

| Option | Description |
|---|---|
| `--format <fmt>` | Output format: `text` (default), `json`, `sarif` (SARIF 2.1.0), or `github` (GitHub Actions annotations) |
| `--json` | Shorthand for `--format json` |
| `--fail-on <level>` | Exit with code `1` on `high` (default), `medium`, `low`, or `none` |
| `--ignore <pattern>` | Ignore files/folders matching pattern (repeatable) |
| `--no-color` | Disable ANSI colors (also respects `NO_COLOR`) |
| `--help, -h` | Show help |
| `--version, -v` | Show version |

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Scan completed; no findings at or above `--fail-on` threshold |
| `1` | Scan completed; at least one finding at or above `--fail-on` threshold |
| `2` | Invalid CLI flag, invalid config JSON, or unreadable/nonexistent target path |

---

## Configuration (`.cacheinspectorrc.json`)

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

---

## Programmatic API (ESM + TypeScript Types)

```ts
import { scanProject, scanSource, formatSarif } from 'cache-inspector-scan';

const result = scanProject('./my-next-app');
console.log(result.summary, result.findings);

// Scan an in-memory buffer (ideal for custom tooling)
const findings = scanSource(`export default async function Page() { await fetch('/api'); }`, {
  filePath: 'app/page.tsx',
  nextVersion: 15,
});
```

---

## Universal IDE Extension & LSP (All IDEs, All OSes)

- **VS Code, Cursor, Windsurf, VSCodium, Antigravity, Theia, Codespaces**: Universal zero-dependency extension in [`extension/`](./extension/README.md) supporting `vscode >= 1.60.0` (old and latest IDEs) on Windows, macOS, and Linux.
- **Neovim, JetBrains (LSP4IJ), Sublime Text, Zed, Helix, Emacs**: Built-in zero-dependency Language Server (`cache-inspector-lsp`) included in this npm package. See [`extension/README.md`](./extension/README.md) for copy-paste setup configs.

---

## Security & Privacy

- **Zero dependencies** — minimal supply-chain surface.
- **100% local** — no network access, no telemetry.
- **Hardened scanner** — symlink escape prevention, file-size/depth/count limits, ANSI escape sanitization (CWE-150), and prototype-pollution-safe JSON parsing.

## Engineering Documentation

- [PRD](./docs/PRD.md)
- [Architecture](./docs/architecture.md)
- [Technical Design](./docs/design.md)
- [Rules Reference](./docs/rules.md)
- [Engineering Memory & Security Audit](./docs/memory.md)
- [Project Tracker](./docs/tracker.md)

## License

MIT
