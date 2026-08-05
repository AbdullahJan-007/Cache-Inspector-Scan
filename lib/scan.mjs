import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { walkFiles } from './walk.mjs';
import { detectNextVersion, explainDefaultBehavior, severityForMissingCache } from './next-version.mjs';
import { findFetchCalls, hasExplicitCacheConfig, isMutatingMethod } from './fetch-scanner.mjs';
import { checkMissingInvalidation } from './action-scanner.mjs';

export function scanProject(targetDir) {
  const nextVersion = detectNextVersion(targetDir);

  const scanRoots = ['app', 'pages', 'src/app', 'src/pages']
    .map((d) => path.join(targetDir, d))
    .filter((d) => existsSync(d));

  const files = scanRoots.flatMap((root) => walkFiles(root));
  const findings = [];

  for (const file of files) {
    const relPath = path.relative(targetDir, file);
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const call of findFetchCalls(text)) {
      if (isMutatingMethod(call.fullCall)) continue; // POST/PUT/DELETE/PATCH — not a caching question
      if (!hasExplicitCacheConfig(call.fullCall)) {
        findings.push({
          file: relPath,
          line: call.lineNumber,
          type: 'missing-cache-option',
          snippet: call.fullCall.slice(0, 90).replace(/\s+/g, ' '),
          message: explainDefaultBehavior(nextVersion),
          severity: severityForMissingCache(nextVersion),
        });
      }
    }

    const invalidationFinding = checkMissingInvalidation(text);
    if (invalidationFinding) {
      findings.push({ file: relPath, line: null, snippet: null, ...invalidationFinding });
    }
  }

  return {
    targetDir,
    nextVersion,
    rootsScanned: scanRoots.map((r) => path.relative(targetDir, r)),
    filesScanned: files.length,
    findings,
  };
}
