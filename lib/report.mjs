const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

// Colors only when it's safe to use them: a real terminal, and the user
// hasn't opted out. Respects the NO_COLOR convention (no-color.org) so this
// doesn't spew garbled escape codes into CI logs or piped output.
export function shouldUseColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

function severityLabel(severity, useColor) {
  if (!useColor) return severity.toUpperCase();
  const codes = { high: '31', medium: '33', low: '32' };
  return `\x1b[${codes[severity]}m${severity.toUpperCase()}\x1b[0m`;
}

export function printReport(result, { useColor = shouldUseColor() } = {}) {
  const { targetDir, nextVersion, rootsScanned, filesScanned, findings } = result;

  console.log(`\nCache Inspector scan — ${targetDir}`);
  console.log(`Next.js version detected: ${nextVersion ?? 'unknown'}`);
  console.log(`Scanned: ${rootsScanned.join(', ') || '(no app/ or pages/ folder found)'}  (${filesScanned} files)\n`);

  if (filesScanned === 0) {
    console.log("Didn't find an app/ or pages/ folder here. Run this from inside a Next.js project.");
    return;
  }

  if (findings.length === 0) {
    console.log('No caching issues found by this scan.');
    console.log('(Checks: fetch() cache options, Server Action invalidation. Not a full audit.)');
    return;
  }

  const sorted = [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const counts = sorted.reduce((acc, f) => ((acc[f.severity] = (acc[f.severity] || 0) + 1), acc), {});

  console.log(
    `Found ${findings.length} thing${findings.length === 1 ? '' : 's'} worth a look: ` +
      `${counts.high || 0} high, ${counts.medium || 0} medium, ${counts.low || 0} low\n`
  );

  for (const f of sorted) {
    const location = f.line ? `${f.file}:${f.line}` : f.file;
    console.log(`[${severityLabel(f.severity, useColor)}] ${location}`);
    if (f.snippet) console.log(`   ${f.snippet}`);
    console.log(`   -> ${f.message}\n`);
  }
}

export function printJson(result) {
  console.log(JSON.stringify(result, null, 2));
}
