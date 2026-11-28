import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scanSource } from './scan.mjs';
import { detectNextVersionInfo } from './next-version.mjs';
import { loadConfig } from './config.mjs';
import { toPosixPath } from './security.mjs';
import { getFixesForFinding } from './autofix.mjs';

const LSP_SEVERITY = Object.freeze({
  high: 1, // DiagnosticSeverity.Error
  medium: 2, // DiagnosticSeverity.Warning
  low: 3, // DiagnosticSeverity.Information
});

/**
 * Converts a Cache Inspector finding into an LSP Diagnostic object.
 */
export function findingToLspDiagnostic(finding) {
  const startLine = Math.max(0, (finding.line || 1) - 1);
  const startChar = Math.max(0, (finding.column || 1) - 1);
  const endLine = Math.max(startLine, (finding.endLine || finding.line || 1) - 1);
  const endChar = finding.endColumn ? Math.max(startChar + 1, finding.endColumn - 1) : startChar + 12;

  return {
    range: {
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar },
    },
    severity: LSP_SEVERITY[finding.severity] || 2,
    code: finding.ruleId || finding.type,
    source: 'cache-inspector',
    message: finding.suggestion ? `${finding.message}\nFix: ${finding.suggestion}` : finding.message,
  };
}

/**
 * Creates a zero-dependency LSP (JSON-RPC 2.0) server instance over any
 * readable/writable stream pair (defaults to process.stdin / process.stdout).
 * Works across Windows, macOS, and Linux in any LSP-capable editor.
 */
export function createLspServer({ input = process.stdin, output = process.stdout } = {}) {
  let workspaceRoot = process.cwd();
  let nextVersionInfo = null;
  let projectConfig = null;
  let buffer = Buffer.alloc(0);
  let shutdownRequested = false;
  const openDocuments = new Map(); // uri -> text

  function sendMessage(payload) {
    const json = JSON.stringify({ jsonrpc: '2.0', ...payload });
    const byteLength = Buffer.byteLength(json, 'utf8');
    output.write(`Content-Length: ${byteLength}\r\n\r\n${json}`);
  }

  function sendResponse(id, result) {
    sendMessage({ id, result });
  }

  function sendError(id, code, message) {
    sendMessage({ id, error: { code, message } });
  }

  function sendNotification(method, params) {
    sendMessage({ method, params });
  }

  function uriToFsPath(uri) {
    if (typeof uri !== 'string') return '';
    if (uri.startsWith('file://')) {
      try {
        return fileURLToPath(uri);
      } catch {
        return uri.slice(7);
      }
    }
    return uri;
  }

  function refreshWorkspaceMetadata(rootDir) {
    workspaceRoot = rootDir;
    try {
      nextVersionInfo = detectNextVersionInfo(rootDir);
    } catch {
      nextVersionInfo = null;
    }
    try {
      projectConfig = loadConfig(rootDir);
    } catch {
      projectConfig = null;
    }
  }

  function analyzeAndPublish(uri, text) {
    const fsPath = uriToFsPath(uri);
    const relPath = fsPath && workspaceRoot ? toPosixPath(path.relative(workspaceRoot, fsPath)) : toPosixPath(fsPath || 'app/page.tsx');

    // Only scan JS/TS files
    if (!/\.[cm]?[jt]sx?$/.test(relPath)) {
      sendNotification('textDocument/publishDiagnostics', { uri, diagnostics: [] });
      return;
    }

    const findings = scanSource(text, {
      filePath: relPath,
      nextVersion: nextVersionInfo,
      rules: projectConfig?.rules || null,
    });

    const diagnostics = findings.map(findingToLspDiagnostic);
    sendNotification('textDocument/publishDiagnostics', { uri, diagnostics });
  }

  function handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    const { id, method, params } = msg;

    if (method === 'initialize') {
      const rootUri = params?.rootUri || params?.workspaceFolders?.[0]?.uri;
      const rootPath = rootUri ? uriToFsPath(rootUri) : params?.rootPath || process.cwd();
      refreshWorkspaceMetadata(rootPath);

      sendResponse(id, {
        capabilities: {
          textDocumentSync: 1, // TextDocumentSyncKind.Full
          codeActionProvider: true,
        },
        serverInfo: {
          name: 'cache-inspector-lsp',
          version: '2.0.0',
        },
      });
      return;
    }

    if (method === 'initialized') {
      return;
    }

    if (method === 'shutdown') {
      shutdownRequested = true;
      sendResponse(id, null);
      return;
    }

    if (method === 'exit') {
      if (input === process.stdin) {
        process.exit(shutdownRequested ? 0 : 1);
      }
      return;
    }

    if (method === 'textDocument/didOpen') {
      const doc = params?.textDocument;
      if (doc?.uri && typeof doc.text === 'string') {
        openDocuments.set(doc.uri, doc.text);
        analyzeAndPublish(doc.uri, doc.text);
      }
      return;
    }

    if (method === 'textDocument/didChange') {
      const uri = params?.textDocument?.uri;
      const changes = params?.contentChanges;
      if (uri && Array.isArray(changes) && changes.length > 0) {
        const latest = changes[changes.length - 1];
        if (typeof latest.text === 'string') {
          openDocuments.set(uri, latest.text);
          analyzeAndPublish(uri, latest.text);
        }
      }
      return;
    }

    if (method === 'textDocument/didSave') {
      const uri = params?.textDocument?.uri;
      if (uri && typeof params?.text === 'string') {
        openDocuments.set(uri, params.text);
        analyzeAndPublish(uri, params.text);
      }
      return;
    }

    if (method === 'textDocument/didClose') {
      const uri = params?.textDocument?.uri;
      if (uri) {
        openDocuments.delete(uri);
        sendNotification('textDocument/publishDiagnostics', { uri, diagnostics: [] });
      }
      return;
    }

    if (method === 'textDocument/codeAction') {
      const uri = params?.textDocument?.uri;
      const diagnostics = params?.context?.diagnostics || [];
      const docText = openDocuments.get(uri) || '';
      const actions = [];
      for (const diag of diagnostics) {
        if (diag.source !== 'cache-inspector') continue;
        const line = (diag.range?.start?.line ?? 0) + 1;
        const column = (diag.range?.start?.character ?? 0) + 1;
        const ruleCode = String(diag.code || 'CI001');
        const fixes = docText
          ? getFixesForFinding(docText, { ruleId: ruleCode, line, column })
          : [
              {
                title: `Ignore ${ruleCode} on this line (cache-inspector)`,
                isPreferred: false,
                startLine: line,
                startColumn: 1,
                endLine: line,
                endColumn: 1,
                newText: `// cache-inspector-ignore-next-line ${ruleCode}\n`,
              },
            ];

        for (const fix of fixes) {
          actions.push({
            title: fix.title,
            kind: 'quickfix',
            isPreferred: Boolean(fix.isPreferred),
            diagnostics: [diag],
            edit: {
              changes: {
                [uri]: [
                  {
                    range: {
                      start: { line: fix.startLine - 1, character: fix.startColumn - 1 },
                      end: { line: fix.endLine - 1, character: fix.endColumn - 1 },
                    },
                    newText: fix.newText,
                  },
                ],
              },
            },
          });
        }
      }
      sendResponse(id, actions);
      return;
    }

    // Respond cleanly to unknown requests so clients don't hang
    if (id !== undefined) {
      sendError(id, -32601, `Method not found: ${method}`);
    }
  }

  function processBuffer() {
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const headerStr = buffer.subarray(0, headerEnd).toString('ascii');
      const lengthMatch = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = Number.parseInt(lengthMatch[1], 10);
      const totalLength = headerEnd + 4 + contentLength;
      if (buffer.length < totalLength) return;

      const body = buffer.subarray(headerEnd + 4, totalLength).toString('utf8');
      buffer = buffer.subarray(totalLength);

      try {
        const msg = JSON.parse(body);
        handleMessage(msg);
      } catch {
        // ignore malformed JSON-RPC frame
      }
    }
  }

  function start() {
    input.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      processBuffer();
    });
  }

  return { start, handleMessage };
}
