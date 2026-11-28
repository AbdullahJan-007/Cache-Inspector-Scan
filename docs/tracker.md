# Project Tracker

## Release Status

| Component | Version | Status | Notes |
|---|---|---|---|
| Core Engine & CLI (`cache-inspector-scan`) | `2.0.0` | Ready for npm publish | 0 dependencies, ~23 kB tarball (`npm run pack:check` verified) |
| GitHub Actions CI (`.github/workflows/ci.yml`) | - | Passing (9/9) | Ubuntu, macOS, Windows x Node 18, 20, 22 |
| Automated Release (`.github/workflows/release.yml`) | - | Configured | Tag-triggered (`v*`) & manual dispatch for npm + Open VSX |
| Open VSX Extension (`abdullahjan.cache-inspector-vscode`) | `2.1.0` | Live (`2.0.2` live, `2.1.0` packaged) | Custom 256x256 icon, real autofix quick actions, cleaned README |

## Test Suite (`node --test`)

- **Unit (`test/*.test.mjs`)**: Lexer, fetch scanner, action scanner, Next.js version detector, rules `CI001`-`CI006`, autofix engine, report formatters (`text`, `json`, `sarif`, `github`), VS Code extension adapter.
- **Integration (`test/integration/*.test.mjs`)**: Next.js 15/16 project scans, hoisted monorepo detection, `.cacheinspectorrc.json`, CLI subprocess exit codes, LSP JSON-RPC 2.0 lifecycle & code actions.
- **Security (`test/security-redteam.test.mjs`)**: Symlink escape, oversized file limit, ANSI escape stripping, `O(n^2)` regression, prototype pollution, config path traversal, non-directory target.

## Release Checklist

- [x] Core v2.0.0 engine, rules `CI001`-`CI006`, TypeScript types, autofix engine, and LSP server
- [x] Security audit (S1-S7) and automated red-team tests
- [x] Cross-OS CI matrix passing (9/9 jobs) + Release workflow configured
- [x] Open VSX extension live (`2.0.2`) and `2.1.0` packaged with real autofixes
- [x] `CHANGELOG.md` and npm/Open VSX docs completed
- [ ] Run `npm publish` for `cache-inspector-scan@2.0.0`
- [ ] Publish `cache-inspector-vscode-2.1.0.vsix` to Open VSX
