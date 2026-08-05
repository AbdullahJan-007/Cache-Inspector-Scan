import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function detectNextVersion(targetDir) {
  // Prefer the actually-installed version — accurate even if package.json
  // says "latest" or a loose range like "^15".
  const installedPkgPath = path.join(targetDir, 'node_modules', 'next', 'package.json');
  if (existsSync(installedPkgPath)) {
    try {
      const installed = JSON.parse(readFileSync(installedPkgPath, 'utf8'));
      const major = parseInt(String(installed.version).split('.')[0], 10);
      if (!Number.isNaN(major)) return major;
    } catch {
      // fall through to package.json range
    }
  }

  const pkgPath = path.join(targetDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const raw = pkg.dependencies?.next || pkg.devDependencies?.next;
      const numMatch = raw && raw.match(/(\d+)/);
      if (numMatch) return parseInt(numMatch[1], 10);
    } catch {
      // fall through
    }
  }

  return null;
}

export function explainDefaultBehavior(nextVersion) {
  if (nextVersion === null) {
    return "Couldn't detect a Next.js version here, so I can't tell you the real default — check package.json.";
  }
  if (nextVersion <= 14) {
    return `Next.js ${nextVersion}: a fetch with no cache option is CACHED indefinitely by default. If you wanted fresh data here, this is probably a bug.`;
  }
  return `Next.js ${nextVersion}: a fetch with no cache option is NOT cached by default (this changed in Next.js 15). If you wanted this cached, this is probably a bug.`;
}

export function severityForMissingCache(nextVersion) {
  // Riskier on 15+ because the default silently flipped — a dev who
  // learned on 14 (or copied old tutorial code) won't expect this.
  if (nextVersion === null) return 'medium';
  return nextVersion >= 15 ? 'high' : 'low';
}
