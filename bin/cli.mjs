#!/usr/bin/env node
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../lib/scan.mjs';
import { printReport, printJson } from '../lib/report.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readOwnVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

const HELP = `cache-inspector-scan — find Next.js caching mistakes in real code

Usage:
  cache-inspector-scan [path]        Scan a project (defaults to current folder)
  cache-inspector-scan --json [path] Print results as JSON instead
  cache-inspector-scan --help        Show this message
  cache-inspector-scan --version     Show the installed version

Exit codes:
  0   scan completed, nothing HIGH severity found
  1   scan completed, at least one HIGH severity issue found
  2   couldn't run the scan (bad path, etc.)

No network access, no external dependencies, no data leaves your machine —
this only reads local files.`;

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(readOwnVersion());
  process.exit(0);
}

const asJson = args.includes('--json');
const positional = args.find((a) => !a.startsWith('-'));
const targetDir = positional ? path.resolve(positional) : process.cwd();

let result;
try {
  result = scanProject(targetDir);
} catch (err) {
  console.error(`Could not scan ${targetDir}: ${err.message}`);
  process.exit(2);
}

if (asJson) {
  printJson(result);
} else {
  printReport(result);
}

const hasHighSeverity = result.findings.some((f) => f.severity === 'high');
process.exit(hasHighSeverity ? 1 : 0);
