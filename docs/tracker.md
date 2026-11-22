# Engineering Project Tracker — `cache-inspector-scan` v2.0.0

## Milestone Status

| Milestone | Scope | Status | Verification |
|---|---|---|---|
| M1: Audit & Red-Team | Full codebase bug audit + security threat modeling (S1–S7) | Completed | Documented in `docs/memory.md` |
| M2: Core Engine v2 | Zero-dep lexer, security guardrails, monorepo version detector, 6 Next.js rules (`CI001`–`CI006`), JSON config | Completed | 56/56 tests passing |
| M3: CLI & CI Formats | `--format text|json|sarif|github`, `--fail-on`, `--ignore`, strict flag validation, `realpathSync` bin guard | Completed | `test/integration/cli.test.mjs` |
| M4: Universal IDE & LSP | Pure stdio LSP server (`cache-inspector-lsp`) + VS Code / Open VSX extension (`^1.60.0`, cross-OS) | Completed | `test/integration/lsp.test.mjs`, `test/extension.test.mjs` |
| M5: Documentation Suite | `PRD.md`, `architecture.md`, `design.md`, `rules.md`, `memory.md`, `tracker.md`, flagship `README.md` | Completed | Verified in `docs/` |
| M6: npm Release Readiness | `package.json` v2.0.0, `exports`, `types/index.d.ts`, `npm pack --dry-run` audit | Completed | `npm run pack:check` |

## Test Coverage Matrix

- **Unit Tests (`test/*.test.mjs`)**: Lexer, Fetch Scanner, Action Scanner, Next.js Version Detector, Rules CI001–CI006, Report Formatters, VS Code Extension Adapter.
- **Integration Tests (`test/integration/*.test.mjs`)**: Full Next.js 15/16 project scans, Monorepo hoisted `node_modules`, `.cacheinspectorrc.json` config, CLI subprocess exit codes & formats, LSP JSON-RPC 2.0 protocol.
- **Security Red-Team Tests (`test/security-redteam.test.mjs`)**: S1 Symlink escape, S2 Oversized file DoS, S3 ANSI/OSC injection, S4 Quadratic CPU DoS, S5 Prototype pollution, S6 Config path traversal, S7 Non-directory target.

## npm Publish Checklist

- [x] Bump `version` to `2.0.0` in `package.json`
- [x] Verify `exports`, `main`, `types`, and `bin` entries
- [x] Run `npm test` — 100% passing
- [x] Run `npm run pack:check` — verify only `bin/`, `lib/`, `types/`, `README.md`, `LICENSE` are included
- [ ] Run `npm login` and `npm publish`
- [ ] Optional: Package & publish IDE extension (`cd extension && npm run sync-core && npx @vscode/vsce package`)
