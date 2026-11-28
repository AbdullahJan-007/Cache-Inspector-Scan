# Next.js Cache Inspector

Real-time static analysis for Next.js App Router caching in your editor. Runs locally with zero external dependencies and no native binaries on Windows, macOS, and Linux (`vscode >= 1.60.0`).

## Features

- **Live Diagnostics**: Highlights Next.js caching issues in JS/TS/JSX/TSX files as you open, edit, or save.
- **Version-Aware**: Automatically detects your installed Next.js version (14, 15, 16+, including monorepos) so severity and guidance match your project.
- **Quick Fixes & Autofix**: One-click autofixes to add `{ cache: 'no-store' }`, `{ next: { revalidate: 60 } }`, or `export const dynamic` directly from the lightbulb menu, plus targeted `// cache-inspector-ignore-next-line <ruleId>` comments.
- **Workspace Scan**: Run a full project scan from the Command Palette or Status Bar.
- **Zero Dependencies**: Works offline with no network access or telemetry.

## Rules Checked

| ID | Rule | What it catches |
|---|---|---|
| `CI001` | `missing-cache-option` | Server `fetch()` calls missing `cache` or `next: { revalidate / tags }` (skips `'use client'`, `pages/`, mutations, and segment config). |
| `CI002` | `possible-missing-invalidation` | `'use server'` files without `revalidatePath()`, `revalidateTag()`, `updateTag()`, or `refresh()`. |
| `CI003` | `conflicting-cache-options` | Contradictory `fetch()` options (`cache: 'no-store'` with positive `revalidate`, or `force-cache` with `revalidate: 0`). |
| `CI004` | `route-handler-get-caching` | `GET` Route Handlers (`route.ts`) without explicit `dynamic` or `revalidate`. |
| `CI005` | `dynamic-api-with-force-static` | `cookies()`, `headers()`, or `draftMode()` called alongside `export const dynamic = 'force-static'`. |
| `CI006` | `use-cache-without-cache-life` | `'use cache'` without `cacheLife()` or `cacheTag()`. |

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Cache Inspector: Scan Workspace` - Scan all Next.js source folders in the workspace.
- `Cache Inspector: Clear Diagnostics` - Clear all diagnostics from the Problems panel.

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `cacheInspector.enable` | `boolean` | `true` | Enable or disable diagnostics. |
| `cacheInspector.scanOnType` | `boolean` | `true` | Analyze open files while typing (debounced). |
| `cacheInspector.debounceMs` | `number` | `250` | Delay in milliseconds before re-analyzing while typing. |
| `cacheInspector.disabledRules` | `string[]` | `[]` | Rule IDs to turn off (e.g. `["CI006"]`). |

Project-level `.cacheinspectorrc.json` files are also respected.

## Using in Other Editors (LSP)

For Neovim, JetBrains, Sublime Text, Helix, or Emacs, install the npm package which ships a standalone stdio Language Server (`cache-inspector-lsp`):

```bash
npm install -g cache-inspector-scan
```

### Neovim (`nvim-lspconfig`)

```lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

if not configs.cache_inspector then
  configs.cache_inspector = {
    default_config = {
      cmd = { 'cache-inspector-lsp' },
      filetypes = { 'javascript', 'javascriptreact', 'typescript', 'typescriptreact' },
      root_dir = lspconfig.util.root_pattern('next.config.js', 'next.config.mjs', 'next.config.ts', 'package.json'),
    },
  }
end
lspconfig.cache_inspector.setup({})
```

### JetBrains (WebStorm / IntelliJ IDEA)

1. Install the **LSP4IJ** plugin.
2. Go to **Settings > Languages & Frameworks > Language Servers > +**.
3. Set command to `cache-inspector-lsp` for `*.ts, *.tsx, *.js, *.jsx`.

### Sublime Text (`LSP`)

```json
{
  "clients": {
    "cache-inspector": {
      "enabled": true,
      "command": ["cache-inspector-lsp"],
      "selector": "source.js | source.jsx | source.ts | source.tsx"
    }
  }
}
```

### Helix (`languages.toml`)

```toml
[language-server.cache-inspector]
command = "cache-inspector-lsp"
```

### Emacs (`eglot`)

```elisp
(add-to-list 'eglot-server-programs
             '((js-mode tsx-ts-mode typescript-ts-mode) . ("cache-inspector-lsp")))
```

## Links

- [GitHub Repository](https://github.com/AbdullahJan-007/Cache-Inspector-Scan)
- [npm Package (`cache-inspector-scan`)](https://www.npmjs.com/package/cache-inspector-scan)
- [Rules Reference](https://github.com/AbdullahJan-007/Cache-Inspector-Scan/blob/main/docs/rules.md)

## License

MIT
