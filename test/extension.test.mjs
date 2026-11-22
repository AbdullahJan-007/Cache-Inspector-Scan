import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createExtension } = require('../extension/extension.js');

function createMockVscode(workspaceRoot) {
  const diagnosticStore = new Map();
  const registeredCommands = new Map();

  class Range {
    constructor(sl, sc, el, ec) {
      this.start = { line: sl, character: sc };
      this.end = { line: el, character: ec };
    }
  }
  class Position {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  }
  class Diagnostic {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  }
  class CodeAction {
    constructor(title, kind) {
      this.title = title;
      this.kind = kind;
    }
  }
  class WorkspaceEdit {
    constructor() {
      this.edits = [];
    }
    insert(uri, pos, text) {
      this.edits.push({ uri, pos, text });
    }
  }

  return {
    diagnosticStore,
    registeredCommands,
    Range,
    Position,
    Diagnostic,
    CodeAction,
    WorkspaceEdit,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
    CodeActionKind: { QuickFix: 'quickfix' },
    StatusBarAlignment: { Left: 1 },
    Uri: { file: (p) => ({ fsPath: p, toString: () => `file://${p}` }) },
    languages: {
      createDiagnosticCollection: () => ({
        set: (uri, diags) => diagnosticStore.set(uri.fsPath, diags),
        delete: (uri) => diagnosticStore.delete(uri.fsPath),
        clear: () => diagnosticStore.clear(),
        dispose: () => {},
      }),
      registerCodeActionsProvider: () => ({ dispose: () => {} }),
    },
    window: {
      createStatusBarItem: () => ({ text: '', tooltip: '', show: () => {}, dispose: () => {} }),
      showInformationMessage: () => {},
    },
    commands: {
      registerCommand: (name, fn) => {
        registeredCommands.set(name, fn);
        return { dispose: () => {} };
      },
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: workspaceRoot } }],
      textDocuments: [],
      getWorkspaceFolder: () => ({ uri: { fsPath: workspaceRoot } }),
      getConfiguration: () => ({
        get: (_k, def) => def,
      }),
      onDidOpenTextDocument: () => ({ dispose: () => {} }),
      onDidSaveTextDocument: () => ({ dispose: () => {} }),
      onDidChangeTextDocument: () => ({ dispose: () => {} }),
      onDidCloseTextDocument: () => ({ dispose: () => {} }),
    },
  };
}

test('VS Code / Open VSX extension analyzes documents and produces quick-fix code actions', async () => {
  const root = path.resolve('/tmp/fake-next-app');
  const vscode = createMockVscode(root);
  const ext = createExtension(vscode);
  const context = { subscriptions: [] };
  ext.activate(context);

  const filePath = path.join(root, 'app', 'page.tsx');
  const lines = [
    'export default async function Page() {',
    "  const res = await fetch('https://api.example.com/data');",
    '  return null;',
    '}',
  ];
  const doc = {
    languageId: 'typescriptreact',
    uri: vscode.Uri.file(filePath),
    lineCount: lines.length,
    getText: () => lines.join('\n'),
    lineAt: (idx) => ({ text: lines[idx] }),
  };

  await ext.analyzeDocument(doc);
  const diags = vscode.diagnosticStore.get(filePath);
  assert.ok(Array.isArray(diags) && diags.length === 1);
  assert.equal(diags[0].code, 'CI001');
  assert.equal(diags[0].source, 'cache-inspector');

  const provider = ext.createCodeActionProvider(vscode);
  const actions = provider.provideCodeActions(doc, diags[0].range, { diagnostics: diags });
  assert.equal(actions.length, 1);
  assert.match(actions[0].title, /Ignore CI001/);
  assert.match(actions[0].edit.edits[0].text, /cache-inspector-ignore-next-line CI001/);

  ext.deactivate();
});
