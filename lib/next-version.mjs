import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { safeJsonParse } from './security.mjs';

const MAX_MONOREPO_ASCENT = 5;

function parseSemver(versionStr) {
  if (typeof versionStr !== 'string') return null;
  const trimmed = versionStr.trim();
  const match = trimmed.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: match[2] !== undefined ? Number.parseInt(match[2], 10) : 0,
    patch: match[3] !== undefined ? Number.parseInt(match[3], 10) : 0,
    raw: trimmed,
  };
}

/**
 * Returns rich Next.js version metadata by checking:
 * 1. Installed `node_modules/next/package.json` in `targetDir` or up to
 *    5 ancestor directories (supports Turborepo, pnpm, Yarn, npm workspaces).
 * 2. Declared `dependencies.next` / `devDependencies.next` / `peerDependencies.next`
 *    in `targetDir/package.json`.
 */
export function detectNextVersionInfo(targetDir) {
  let current = path.resolve(targetDir);
  for (let depth = 0; depth <= MAX_MONOREPO_ASCENT; depth++) {
    const installedPkgPath = path.join(current, 'node_modules', 'next', 'package.json');
    if (existsSync(installedPkgPath)) {
      try {
        const installed = safeJsonParse(readFileSync(installedPkgPath, 'utf8'));
        const parsed = parseSemver(installed?.version);
        if (parsed) {
          return { ...parsed, source: 'node_modules' };
        }
      } catch {
        // continue searching
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const pkgPath = path.join(path.resolve(targetDir), 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = safeJsonParse(readFileSync(pkgPath, 'utf8'));
      const raw =
        pkg?.dependencies?.next ||
        pkg?.devDependencies?.next ||
        pkg?.peerDependencies?.next;
      const parsed = parseSemver(raw);
      if (parsed) {
        return { ...parsed, source: 'package.json' };
      }
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Backwards-compatible helper returning the Next.js major version number or null.
 */
export function detectNextVersion(targetDir) {
  const info = detectNextVersionInfo(targetDir);
  return info ? info.major : null;
}

export function explainDefaultBehavior(nextVersion) {
  const major = typeof nextVersion === 'object' && nextVersion !== null ? nextVersion.major : nextVersion;
  if (major === null || major === undefined) {
    return (
      "Couldn't detect a Next.js version here, so the default fetch() caching behavior is ambiguous — " +
      "add an explicit cache option (`cache: 'no-store'`, `cache: 'force-cache'`, or `next: { revalidate }`)."
    );
  }
  if (major <= 14) {
    return (
      `Next.js ${major}: a fetch() with no cache option is CACHED indefinitely by default. ` +
      "If you wanted fresh data here, add `{ cache: 'no-store' }` or `{ next: { revalidate: 60 } }`."
    );
  }
  return (
    `Next.js ${major}: a fetch() with no cache option is NOT cached by default (this changed in Next.js 15). ` +
    "Add `{ cache: 'force-cache' }`, `{ next: { revalidate: 60 } }`, or `{ cache: 'no-store' }` to make intent explicit."
  );
}

export function severityForMissingCache(nextVersion) {
  const major = typeof nextVersion === 'object' && nextVersion !== null ? nextVersion.major : nextVersion;
  if (major === null || major === undefined) return 'medium';
  return major >= 15 ? 'high' : 'low';
}
