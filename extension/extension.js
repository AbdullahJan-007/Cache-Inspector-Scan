'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SUPPORTED_LANGUAGES = new Set([
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
]);

let coreModulePromise = null;

/**
 * Loads the zero-dependency Cache Inspector core engine.
 * Works both inside the monorepo (../lib/index.mjs) and when packaged
 * as a standalone .vsix (./core/index.mjs) across Windows, macOS, and Linux.
 */
async function loadCore() {
  if (!coreModulePromise) {
    const candidates = [
      path.join(__dirname, 'core', 'index.mjs'),
      path.join(__dirname, '..', 'lib', 'index.mjs'),
    ];
    const target = candidates.find((p) => fs.existsSync(p));
    if (!target) {
      throw new Error('Cache Inspector core engine not found. Run `npm run sync-core` before packaging.');
    }
    coreModulePromise = import(pathToFileURL(target).href);
  }
  return coreModulePromise;
}

function mapSeverity(vscode, severity) {
  if (severity === 'high') return vscode.DiagnosticSeverity.Error;
  if (severity === 'medium') return vscode.DiagnosticSeverity.Warning;
  return vscode.DiagnosticSeverity.Information;
}

function findingToDiagnostic(vscode, finding, document) {
  const lineIndex = Math.max(0, (finding.line || 1) - 1);
  const startChar = Math.max(0, (finding.column || 1) - 1);
  const endLine = Math.max(lineIndex, (finding.endLine || finding.line || 1) - 1);
  let endChar = finding.endColumn ? Math.max(startChar + 1, finding.endColumn - 1) : startChar + 16;

  if (document && typeof document.lineAt === 'function' && lineIndex < document.lineCount) {
    const lineText = document.lineAt(lineIndex).text;
    if (endLine === lineIndex) {
      endChar = Math.min(Math.max(endChar, startChar + 1), Math.max(lineText.length, startChar + 1));
    }
  }

  const range = new vscode.Range(lineIndex, startChar, endLine, endChar);
  const message = finding.suggestion ? `${finding.message}\nFix: ${finding.suggestion}` : finding.message;
  const diag = new vscode.Diagnostic(range, message, mapSeverity(vscode, finding.severity));
  diag.source = 'cache-inspector';
  diag.code = finding.ruleId || finding.type;
  return diag;
}

function getDisabledRulesMap(vscode) {
  const cfg = vscode.workspace.getConfiguration('cacheInspector');
  const disabled = cfg.get('disabledRules', []);
  const map = Object.create(null);
  if (Array.isArray(disabled)) {
    for (const id of disabled) {
      map[String(id)] = 'off';
    }
  }
  return map;
}

function createCodeActionProvider(vscode) {
  return {
    async provideCodeActions(document, _range, context) {
      const actions = [];
      const relevant = (context.diagnostics || []).filter((d) => d.source === 'cache-inspector');
      if (relevant.length === 0) return actions;

      let core = null;
      try {
        core = await loadCore();
      } catch {
        core = null;
      }

      const sourceText = document.getText();
      for (const diag of relevant) {
        const ruleCode = String(diag.code || 'CI001');
        const line = diag.range.start.line + 1;
        const column = diag.range.start.character + 1;

        if (core && typeof core.getFixesForFinding === 'function') {
          const fixes = core.getFixesForFinding(sourceText, { ruleId: ruleCode, line, column });
          for (const fix of fixes) {
            const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
            action.isPreferred = Boolean(fix.isPreferred);
            action.diagnostics = [diag];
            const edit = new vscode.WorkspaceEdit();
            const range = new vscode.Range(
              fix.startLine - 1,
              fix.startColumn - 1,
              fix.endLine - 1,
              fix.endColumn - 1
            );
            if (typeof edit.replace === 'function') {
              edit.replace(document.uri, range, fix.newText);
            } else {
              edit.insert(document.uri, new vscode.Position(fix.startLine - 1, fix.startColumn - 1), fix.newText);
            }
            action.edit = edit;
            actions.push(action);
          }
          continue;
        }

        // Fallback if core lacks getFixesForFinding
        const zeroLine = diag.range.start.line;
        const indent = document.lineAt(zeroLine).text.match(/^\s*/)[0];
        const ignoreAction = new vscode.CodeAction(
          `Ignore ${ruleCode} on this line (cache-inspector)`,
          vscode.CodeActionKind.QuickFix
        );
        ignoreAction.diagnostics = [diag];
        const edit = new vscode.WorkspaceEdit();
        edit.insert(
          document.uri,
          new vscode.Position(zeroLine, 0),
          `${indent}// cache-inspector-ignore-next-line ${ruleCode}\n`
        );
        ignoreAction.edit = edit;
        actions.push(ignoreAction);
      }
      return actions;
    },
  };
}

/**
 * Factory allowing both real VS Code activation and headless unit testing
 * with a mocked `vscode` module.
 */
function createExtension(vscode) {
  let diagnostics;
  let statusBar;
  const versionCache = new Map();
  const debounceTimers = new Map();

  async function getNextVersionForUri(uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const root = folder ? folder.uri.fsPath : path.dirname(uri.fsPath);
    if (versionCache.has(root)) return versionCache.get(root);
    const core = await loadCore();
    const info = core.detectNextVersionInfo(root);
    versionCache.set(root, info);
    return info;
  }

  function updateStatusBar(nextInfo, count) {
    if (!statusBar) return;
    const ver = nextInfo ? `Next ${nextInfo.major}` : 'Next ?';
    statusBar.text = count > 0 ? `$(warning) Cache Inspector (${ver}): ${count}` : `$(check) Cache Inspector (${ver})`;
    statusBar.tooltip = 'Click to run full Next.js Cache Inspector workspace scan';
    statusBar.show();
  }

  async function analyzeDocument(document) {
    if (!document || !SUPPORTED_LANGUAGES.has(document.languageId)) return;
    const cfg = vscode.workspace.getConfiguration('cacheInspector');
    if (!cfg.get('enable', true)) {
      diagnostics.delete(document.uri);
      return;
    }

    try {
      const core = await loadCore();
      const folder = vscode.workspace.getWorkspaceFolder(document.uri);
      const root = folder ? folder.uri.fsPath : path.dirname(document.uri.fsPath);
      const relPath = path.relative(root, document.uri.fsPath).split(path.sep).join('/');
      const nextVersion = await getNextVersionForUri(document.uri);
      const disabledRules = getDisabledRulesMap(vscode);

      const findings = core.scanSource(document.getText(), {
        filePath: relPath,
        nextVersion,
        rules: disabledRules,
      });

      const list = findings.map((f) => findingToDiagnostic(vscode, f, document));
      diagnostics.set(document.uri, list);
      updateStatusBar(nextVersion, list.length);
    } catch {
      // Never crash the IDE host on transient file or syntax errors
    }
  }

  function scheduleAnalyze(document) {
    const cfg = vscode.workspace.getConfiguration('cacheInspector');
    if (!cfg.get('enable', true) || !cfg.get('scanOnType', true)) return;
    const key = document.uri.toString();
    if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
    const delay = cfg.get('debounceMs', 250);
    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key);
        analyzeDocument(document);
      }, delay)
    );
  }

  async function scanWorkspaceCommand() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showInformationMessage('Cache Inspector: Open a Next.js workspace folder first.');
      return;
    }
    const core = await loadCore();
    const disabledRules = getDisabledRulesMap(vscode);
    let totalFindings = 0;

    diagnostics.clear();
    for (const folder of folders) {
      const rootPath = folder.uri.fsPath;
      const result = core.scanProject(rootPath, { rules: disabledRules });
      versionCache.set(rootPath, result.nextVersionInfo);

      const byFile = new Map();
      for (const f of result.findings) {
        const abs = path.join(rootPath, ...f.file.split('/'));
        if (!byFile.has(abs)) byFile.set(abs, []);
        byFile.get(abs).push(findingToDiagnostic(vscode, f, null));
      }
      for (const [absPath, diags] of byFile.entries()) {
        diagnostics.set(vscode.Uri.file(absPath), diags);
      }
      totalFindings += result.findings.length;
      updateStatusBar(result.nextVersionInfo, totalFindings);
    }

    vscode.window.showInformationMessage(
      `Cache Inspector: Scan complete — ${totalFindings} issue${totalFindings === 1 ? '' : 's'} found.`
    );
  }

  function activate(context) {
    diagnostics = vscode.languages.createDiagnosticCollection('cache-inspector');
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.command = 'cacheInspector.scanWorkspace';

    const selector = [
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'javascriptreact' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
    ];

    context.subscriptions.push(
      diagnostics,
      statusBar,
      vscode.commands.registerCommand('cacheInspector.scanWorkspace', scanWorkspaceCommand),
      vscode.commands.registerCommand('cacheInspector.clearDiagnostics', () => diagnostics.clear()),
      vscode.languages.registerCodeActionsProvider(selector, createCodeActionProvider(vscode), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => analyzeDocument(doc)),
      vscode.workspace.onDidSaveTextDocument((doc) => analyzeDocument(doc)),
      vscode.workspace.onDidChangeTextDocument((evt) => scheduleAnalyze(evt.document)),
      vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.delete(doc.uri))
    );

    // Analyze already-open editors on activation
    for (const doc of vscode.workspace.textDocuments || []) {
      analyzeDocument(doc);
    }
  }

  function deactivate() {
    for (const timer of debounceTimers.values()) clearTimeout(timer);
    debounceTimers.clear();
  }

  return { activate, deactivate, analyzeDocument, scanWorkspaceCommand, findingToDiagnostic, createCodeActionProvider };
}

function activate(context) {
  const vscode = require('vscode');
  const ext = createExtension(vscode);
  activate._instance = ext;
  ext.activate(context);
}

function deactivate() {
  if (activate._instance) {
    activate._instance.deactivate();
  }
}

module.exports = {
  activate,
  deactivate,
  createExtension,
  findingToDiagnostic,
  createCodeActionProvider,
};
