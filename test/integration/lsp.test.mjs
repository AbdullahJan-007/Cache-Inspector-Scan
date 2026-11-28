import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createLspServer } from '../../lib/lsp-server.mjs';

function encodeLsp(msg) {
  const body = JSON.stringify({ jsonrpc: '2.0', ...msg });
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function parseLspFrames(rawBuffer) {
  const messages = [];
  let buf = rawBuffer;
  while (true) {
    const sep = buf.indexOf('\r\n\r\n');
    if (sep === -1) break;
    const header = buf.subarray(0, sep).toString('ascii');
    const lenMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!lenMatch) break;
    const len = Number.parseInt(lenMatch[1], 10);
    if (buf.length < sep + 4 + len) break;
    const json = buf.subarray(sep + 4, sep + 4 + len).toString('utf8');
    messages.push(JSON.parse(json));
    buf = buf.subarray(sep + 4 + len);
  }
  return messages;
}

test('LSP integration: initialize, didOpen publishes diagnostics, codeAction returns quickfix', () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (c) => chunks.push(c));

  const server = createLspServer({ input, output });
  server.start();

  const uri = 'file:///workspace/app/page.tsx';
  input.write(encodeLsp({ id: 1, method: 'initialize', params: { rootUri: 'file:///workspace' } }));
  input.write(
    encodeLsp({
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri,
          languageId: 'typescriptreact',
          version: 1,
          text: `export default async function Page() {\n  await fetch('https://api.example.com');\n}\n`,
        },
      },
    })
  );

  const frames1 = parseLspFrames(Buffer.concat(chunks));
  assert.equal(frames1.length, 2);
  assert.equal(frames1[0].id, 1);
  assert.equal(frames1[0].result.serverInfo.name, 'cache-inspector-lsp');
  assert.equal(frames1[1].method, 'textDocument/publishDiagnostics');
  assert.equal(frames1[1].params.diagnostics.length, 1);
  assert.equal(frames1[1].params.diagnostics[0].code, 'CI001');

  // Request quick-fix code action
  input.write(
    encodeLsp({
      id: 2,
      method: 'textDocument/codeAction',
      params: {
        textDocument: { uri },
        range: frames1[1].params.diagnostics[0].range,
        context: { diagnostics: frames1[1].params.diagnostics },
      },
    })
  );

  const frames2 = parseLspFrames(Buffer.concat(chunks));
  const actionResp = frames2.find((m) => m.id === 2);
  assert.ok(actionResp);
  assert.equal(actionResp.result.length, 3);
  assert.match(actionResp.result[0].title, /no-store/);
  assert.equal(actionResp.result[0].isPreferred, true);
  assert.match(actionResp.result[1].title, /revalidate: 60/);
  assert.match(actionResp.result[2].title, /Ignore CI001/);
});
