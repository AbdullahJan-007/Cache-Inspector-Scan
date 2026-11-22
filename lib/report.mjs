import { RULE_CATALOG } from './rules.mjs';
import { sanitizeForTerminal } from './security.mjs';

const SEVERITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 });

export function shouldUseColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

/**
 * Determines whether the CLI should exit with code 1 based on the --fail-on threshold.
 */
export function shouldFail(findings, failOn = 'high') {
  if (failOn === 'none') return false;
  const threshold = SEVERITY_ORDER[failOn];
  if (threshold === undefined) return findings.some((f) => f.severity === 'high');
  return findings.some((f) => (SEVERITY_ORDER[f.severity] ?? 99) <= threshold);
}

function severityLabel(severity, useColor) {
  const safe = String(severity || 'low').toUpperCase();
  if (!useColor) return safe;
  const codes = Object.assign(Object.create(null), { high: '31', medium: '33', low: '32' });
  const code = codes[severity] || '37';
  return `\x1b[${code}m${safe}\x1b[0m`;
}

export function formatReport(result, { useColor = shouldUseColor() } = {}) {
  const { targetDir, nextVersion, nextVersionInfo, rootsScanned, filesScanned, filesSkipped = [], findings } = result;
  const lines = [];

  const versionDisplay = nextVersionInfo
    ? `${nextVersionInfo.raw} (major ${nextVersionInfo.major}, via ${nextVersionInfo.source})`
    : (nextVersion ?? 'unknown');

  lines.push('');
  lines.push(`Cache Inspector scan — ${sanitizeForTerminal(targetDir)}`);
  lines.push(`Next.js version detected: ${sanitizeForTerminal(String(versionDisplay))}`);
  lines.push(
    `Scanned: ${sanitizeForTerminal(rootsScanned.join(', ') || '(no Next.js source folder found)')}  (${filesScanned} files)`
  );
  if (filesSkipped.length > 0) {
    lines.push(`Skipped: ${filesSkipped.length} file(s) (symlinks, oversized, or depth limit)`);
  }
  lines.push('');

  if (filesScanned === 0) {
    lines.push("Didn't find an app/, src/app/, pages/, or lib/ folder here. Run this from inside a Next.js project.");
    return lines.join('\n');
  }

  if (findings.length === 0) {
    lines.push('No caching issues found by this scan.');
    lines.push('(Checked rules: CI001-CI006 — fetch() caching, Server Action invalidation, Route Handlers, dynamic APIs, use cache.)');
    return lines.join('\n');
  }

  const sorted = [...findings].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));
  const counts = Object.create(null);
  for (const f of sorted) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }

  lines.push(
    `Found ${findings.length} issue${findings.length === 1 ? '' : 's'}: ` +
      `${counts.high || 0} high, ${counts.medium || 0} medium, ${counts.low || 0} low`
  );
  lines.push('');

  for (const f of sorted) {
    const safeFile = sanitizeForTerminal(f.file);
    const location = f.line ? `${safeFile}:${f.line}${f.column ? `:${f.column}` : ''}` : safeFile;
    const ruleTag = f.ruleId ? ` (${sanitizeForTerminal(f.ruleId)})` : '';
    lines.push(`[${severityLabel(f.severity, useColor)}]${ruleTag} ${location}`);
    if (f.snippet) {
      lines.push(`   ${sanitizeForTerminal(f.snippet)}`);
    }
    lines.push(`   -> ${sanitizeForTerminal(f.message)}`);
    if (f.suggestion) {
      lines.push(`   Fix: ${sanitizeForTerminal(f.suggestion)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function printReport(result, options = {}) {
  console.log(formatReport(result, options));
}

export function formatJson(result) {
  return JSON.stringify(result, null, 2);
}

export function printJson(result) {
  console.log(formatJson(result));
}

/**
 * Formats findings as SARIF 2.1.0 for GitHub Code Scanning, Azure DevOps,
 * and IDE SARIF viewers.
 */
export function formatSarif(result, toolVersion = '2.0.0') {
  const levelMap = { high: 'error', medium: 'warning', low: 'note' };
  const rules = Object.values(RULE_CATALOG).map((rule) => ({
    id: rule.id,
    name: rule.type,
    shortDescription: { text: rule.title },
    helpUri: rule.docsUrl,
    defaultConfiguration: {
      level: levelMap[rule.defaultSeverity] || 'warning',
    },
  }));

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'cache-inspector-scan',
            version: toolVersion,
            informationUri: 'https://github.com/AbdullahJan-007/Cache-Inspector-Scan',
            rules,
          },
        },
        results: result.findings.map((f) => ({
          ruleId: f.ruleId || f.type,
          level: levelMap[f.severity] || 'warning',
          message: { text: f.suggestion ? `${f.message} Fix: ${f.suggestion}` : f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.file },
                region: {
                  startLine: f.line || 1,
                  startColumn: f.column || 1,
                },
              },
            },
          ],
        })),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

/**
 * Formats findings as GitHub Actions workflow annotations.
 */
export function formatGithub(result) {
  const levelMap = { high: 'error', medium: 'warning', low: 'notice' };
  return result.findings
    .map((f) => {
      const level = levelMap[f.severity] || 'warning';
      const file = sanitizeForTerminal(f.file);
      const line = f.line || 1;
      const col = f.column || 1;
      const title = sanitizeForTerminal(`${f.ruleId || f.type}: ${f.type}`);
      const msg = sanitizeForTerminal(f.message).replace(/\r?\n/g, '%0A');
      return `::${level} file=${file},line=${line},col=${col},title=${title}::${msg}`;
    })
    .join('\n');
}
