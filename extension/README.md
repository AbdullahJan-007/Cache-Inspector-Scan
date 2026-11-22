# Next.js Cache Inspector — Universal IDE Extension & LSP

Works on **every major IDE (old & latest)** and **every OS (Windows, macOS, Linux)** with **zero native binaries** and **zero external dependencies**.

## 1. VS Code, Cursor, Windsurf, VSCodium, Antigravity, Theia, Gitpod, Codespaces

Compatible with `vscode >= 1.60.0` (both older and latest IDE versions).

### Build & Install Locally (`.vsix`)

```bash
cd extension
npm run sync-core
npx @vscode/vsce package
```

Then install the generated `.vsix` file in any VS Code-compatible IDE:
- **VS Code / Cursor / Windsurf / VSCodium / Antigravity**: `Extensions` → `...` → `Install from VSIX...`
- Or via CLI: `code --install-extension cache-inspector-vscode-2.0.0.vsix`

### Publish to VS Code Marketplace & Open VSX

```bash
npx @vscode/vsce publish
npx ovsx publish cache-inspector-vscode-2.0.0.vsix
```

## 2. Neovim, JetBrains, Sublime Text, Zed, Helix, Emacs (Universal LSP)

Install the npm package globally (or in your project):

```bash
npm install -g cache-inspector-scan
```

The package exposes `cache-inspector-lsp` (standard JSON-RPC 2.0 Language Server over stdio):

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

### JetBrains (WebStorm / IntelliJ IDEA / PhpStorm)

1. Install the free **LSP4IJ** plugin from JetBrains Marketplace.
2. Go to **Settings → Languages & Frameworks → Language Servers → +**.
3. Set **Command**: `cache-inspector-lsp` and map file patterns `*.ts, *.tsx, *.js, *.jsx`.

### Sublime Text (`LSP` package)

Add to `LSP.sublime-settings`:

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
