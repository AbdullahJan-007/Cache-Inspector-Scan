#!/usr/bin/env node
import path from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../lib/scan.mjs';
import {
  formatReport,
  formatJson,
  formatSarif,
  formatGithub,
  shouldUseColor,
  shouldFail,
} from '../lib/report.mjs';
import { sanitizeForTerminal } from '../lib/security.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readOwnVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

const HELP = `cache-inspector-scan — Next.js App Router caching static analyzer

Usage:
  cache-inspector-scan [options] [path]

Options:
  --format <fmt>      Output format: text | json | sarif | github (default: text)
  --json              Shorthand for --format json
  --fail-on <level>   Exit code 1 threshold: high | medium | low | none (default: high)
  --ignore <pattern>  Ignore files/folders matching pattern (repeatable)
  --no-color          Disable ANSI terminal colors
  --help, -h          Show this help message
  --version, -v       Show installed version

Exit codes:
  0   Scan completed with no findings at or above --fail-on threshold
  1   Scan completed with at least one finding at or above --fail-on threshold
  2   Invalid arguments, invalid config, or unreadable target path

Security & Privacy:
  Zero dependencies, 100% local static analysis, no network access.`;

const VALID_FORMATS = new Set(['text', 'json', 'sarif', 'github']);
const VALID_FAIL_ON = new Set(['high', 'medium', 'low', 'none']);

export function parseArgs(argv) {
  const opts = {
    help: false,
    version: false,
    format: 'text',
    failOn: undefined,
    ignore: [],
    noColor: false,
    target: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--version' || arg === '-v') {
      opts.version = true;
    } else if (arg === '--json') {
      opts.format = 'json';
    } else if (arg === '--no-color') {
      opts.noColor = true;
    } else if (arg === '--format') {
      const val = argv[++i];
      if (!val || !VALID_FORMATS.has(val)) {
        throw new Error(`Invalid --format value: ${val || '(missing)'}. Expected: text, json, sarif, or github.`);
      }
      opts.format = val;
    } else if (arg.startsWith('--format=')) {
      const val = arg.slice('--format='.length);
      if (!VALID_FORMATS.has(val)) {
        throw new Error(`Invalid --format value: ${val}. Expected: text, json, sarif, or github.`);
      }
      opts.format = val;
    } else if (arg === '--fail-on') {
      const val = argv[++i];
      if (!val || !VALID_FAIL_ON.has(val)) {
        throw new Error(`Invalid --fail-on value: ${val || '(missing)'}. Expected: high, medium, low, or none.`);
      }
      opts.failOn = val;
    } else if (arg.startsWith('--fail-on=')) {
      const val = arg.slice('--fail-on='.length);
      if (!VALID_FAIL_ON.has(val)) {
        throw new Error(`Invalid --fail-on value: ${val}. Expected: high, medium, low, or none.`);
      }
      opts.failOn = val;
    } else if (arg === '--ignore') {
      const val = argv[++i];
      if (!val) throw new Error('Missing value for --ignore.');
      opts.ignore.push(val);
    } else if (arg.startsWith('--ignore=')) {
      const val = arg.slice('--ignore='.length);
      if (!val) throw new Error('Missing value for --ignore.');
      opts.ignore.push(val);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}. Run with --help to see supported options.`);
    } else if (!opts.target) {
      opts.target = arg;
    } else {
      throw new Error(`Unexpected extra positional argument: ${arg}`);
    }
  }

  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${sanitizeForTerminal(err.message)}`);
    process.exit(2);
  }

  if (opts.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (opts.version) {
    console.log(readOwnVersion());
    process.exit(0);
  }

  const targetDir = opts.target ? path.resolve(opts.target) : process.cwd();
  const version = readOwnVersion();

  let result;
  try {
    result = scanProject(targetDir, {
      ignore: opts.ignore,
      failOn: opts.failOn,
    });
  } catch (err) {
    const safeMsg = sanitizeForTerminal(err.message);
    if (opts.format === 'json') {
      console.error(JSON.stringify({ error: safeMsg, code: err.code || 'SCAN_ERROR' }));
    } else {
      console.error(`Could not scan ${sanitizeForTerminal(targetDir)}: ${safeMsg}`);
    }
    process.exit(2);
  }

  const effectiveFailOn = opts.failOn ?? result.failOn ?? 'high';

  if (opts.format === 'json') {
    console.log(formatJson(result));
  } else if (opts.format === 'sarif') {
    console.log(formatSarif(result, version));
  } else if (opts.format === 'github') {
    const out = formatGithub(result);
    if (out) console.log(out);
  } else {
    const useColor = opts.noColor ? false : shouldUseColor();
    console.log(formatReport(result, { useColor }));
  }

  process.exit(shouldFail(result.findings, effectiveFailOn) ? 1 : 0);
}

function isExecutedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isExecutedDirectly()) {
  main();
}
