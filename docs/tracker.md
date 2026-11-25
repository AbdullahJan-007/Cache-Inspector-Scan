# Project Tracker

## Release Status

| Component | Version | Status | Notes |
|---|---|---|---|
| Core Engine & CLI (`cache-inspector-scan`) | `2.0.0` | Ready for npm publish | 0 dependencies, 21.7 kB tarball (`npm run pack:check` verified) |
| GitHub Actions CI (`.github/workflows/ci.yml`) | - | Passing (9/9) | Ubuntu, macOS, Windows x Node 18, 20, 22 |
| Open VSX Extension (`abdullahjan.cache-inspector-vscode`) | `2.0.2` | Published (2.0.1 live, 2.0.2 packaged) | Custom 256x256 icon, cleaned Open VSX README |

## Test Suite (56 tests, `node --test`)

- **Unit (`test/*.test.mjs`)**: Lexer, fetch scanner, action scanner, Next.js version detector, rules `CI001`-`CI006`, report formatters (`text`, `json`, `sarif`, `github`), VS Code extension adapter.
- **Integration (`test/integration/*.test.mjs`)**: Next.js 15/16 project scans, hoisted monorepo detection, `.cacheinspectorrc.json`, CLI subprocess exit codes, LSP JSON-RPC 2.0 lifecycle.
- **Security (`test/security-redteam.test.mjs`)**: Symlink escape, oversized file limit, ANSI escape stripping, `O(n^2)` regression, prototype pollution, config path traversal, non-directory target.

## Release Checklist

- [x] Core v2.0.0 engine, rules `CI001`-`CI006`, TypeScript types, and LSP server
- [x] Security audit (S1-S7) and automated red-team tests
- [x] Cross-OS CI matrix passing (9/9 jobs)
- [x] Open VSX extension published with custom icon
- [x] Docs cleaned and links verified for npmjs.com and Open VSX
- [ ] Run `npm publish` for `cache-inspector-scan@2.0.0`
- [ ] Publish `cache-inspector-vscode-2.0.2.vsix` to Open VSX
