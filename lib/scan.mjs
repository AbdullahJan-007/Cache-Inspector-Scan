import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { walkFiles } from './walk.mjs';
import { detectNextVersionInfo } from './next-version.mjs';
import { loadConfig } from './config.mjs';
import { runRulesOnSource } from './rules.mjs';
import {
  LIMITS,
  resolveTargetDirectory,
  isPathWithinRoot,
  toPosixPath,
} from './security.mjs';

const SEVERITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 });

/**
 * Scans a single in-memory source string (used by the IDE extension, LSP
 * server, and programmatic callers).
 */
export function scanSource(
  sourceText,
  {
    filePath = 'app/page.tsx',
    nextVersion = null,
    rules = null,
  } = {}
) {
  const normalizedPath = toPosixPath(filePath);
  const findings = runRulesOnSource({
    sourceText: String(sourceText ?? ''),
    relPath: normalizedPath,
    nextVersion,
    ruleOverrides: rules,
  });
  return sortFindings(findings);
}

function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    if (sevDiff !== 0) return sevDiff;
    const fileDiff = a.file.localeCompare(b.file);
    if (fileDiff !== 0) return fileDiff;
    return (a.line ?? 0) - (b.line ?? 0);
  });
}

function computeSummary(findings) {
  const counts = { high: 0, medium: 0, low: 0, total: findings.length };
  for (const f of findings) {
    if (f.severity === 'high' || f.severity === 'medium' || f.severity === 'low') {
      counts[f.severity]++;
    }
  }
  return counts;
}

/**
 * Scans a Next.js project directory on disk with strict path-containment and
 * resource-limit guardrails.
 */
export function scanProject(targetDir, options = {}) {
  const canonicalRoot = resolveTargetDirectory(targetDir);
  const config = loadConfig(canonicalRoot, options);
  const nextVersionInfo = detectNextVersionInfo(canonicalRoot);
  const nextVersion = nextVersionInfo ? nextVersionInfo.major : null;

  const scanRoots = [];
  const seenRoots = new Set();

  for (const relRoot of config.roots) {
    const candidate = path.join(canonicalRoot, relRoot);
    if (!existsSync(candidate)) continue;
    if (!isPathWithinRoot(canonicalRoot, candidate)) continue;
    const norm = toPosixPath(path.relative(canonicalRoot, candidate));
    if (seenRoots.has(norm)) continue;
    seenRoots.add(norm);
    scanRoots.push(candidate);
  }

  const walkState = { files: [], skipped: [] };
  const maxFiles = options.maxFiles ?? LIMITS.MAX_FILES;
  const maxDepth = options.maxDepth ?? LIMITS.MAX_DEPTH;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? LIMITS.MAX_FILE_SIZE_BYTES;

  for (const root of scanRoots) {
    walkFiles(root, {
      canonicalRoot,
      ignore: config.ignore,
      maxDepth,
      maxFiles,
      maxFileSizeBytes,
      state: walkState,
    });
  }

  // Deduplicate files across overlapping roots (e.g. if user configured custom roots)
  const uniqueFiles = [...new Set(walkState.files)];
  const findings = [];

  for (const file of uniqueFiles) {
    const relPath = toPosixPath(path.relative(canonicalRoot, file));
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      walkState.skipped.push({ path: relPath, reason: 'unreadable' });
      continue;
    }

    const fileFindings = runRulesOnSource({
      sourceText: text,
      relPath,
      nextVersion: nextVersionInfo ?? nextVersion,
      ruleOverrides: config.rules,
    });
    findings.push(...fileFindings);
  }

  const sortedFindings = sortFindings(findings);

  return {
    schemaVersion: '2.0.0',
    targetDir: canonicalRoot,
    nextVersion,
    nextVersionInfo,
    configFile: config.configFile,
    failOn: config.failOn,
    rootsScanned: scanRoots.map((r) => toPosixPath(path.relative(canonicalRoot, r))),
    filesScanned: uniqueFiles.length,
    filesSkipped: walkState.skipped,
    summary: computeSummary(sortedFindings),
    findings: sortedFindings,
  };
}
