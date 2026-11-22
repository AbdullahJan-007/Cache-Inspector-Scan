import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { LIMITS, isPathWithinRoot, isSymlink, toPosixPath } from './security.mjs';

export const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
export const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '.vscode',
  '.idea',
  'out',
  'coverage',
  '.turbo',
  '.vercel',
]);

function matchesIgnore(relPosixPath, ignorePatterns) {
  if (!ignorePatterns || ignorePatterns.length === 0) return false;
  for (const pattern of ignorePatterns) {
    const clean = toPosixPath(pattern).replace(/^\.?\//, '');
    if (!clean) continue;
    if (relPosixPath === clean || relPosixPath.startsWith(`${clean}/`) || relPosixPath.includes(clean)) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively finds source files under `dir` with strict security guardrails:
 * - Never follows directory or file symlinks (prevents symlink loops & workspace escape)
 * - Enforces MAX_DEPTH, MAX_FILES, and MAX_FILE_SIZE_BYTES
 * - Tracks skipped files for transparent reporting
 */
export function walkFiles(dir, options = {}) {
  // Backwards-compatible signature: walkFiles(dir, resultsArray)
  if (Array.isArray(options)) {
    const res = walkFiles(dir, {});
    options.push(...res.files);
    return options;
  }

  const {
    canonicalRoot = path.resolve(dir),
    ignore = [],
    maxDepth = LIMITS.MAX_DEPTH,
    maxFiles = LIMITS.MAX_FILES,
    maxFileSizeBytes = LIMITS.MAX_FILE_SIZE_BYTES,
    state = { files: [], skipped: [] },
  } = options;

  function recurse(currentDir, depth) {
    if (depth > maxDepth) {
      state.skipped.push({ path: toPosixPath(path.relative(canonicalRoot, currentDir)), reason: 'max-depth-exceeded' });
      return;
    }
    if (state.files.length >= maxFiles) return;

    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Deterministic order across filesystems/OSes
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (state.files.length >= maxFiles) break;
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPosix = toPosixPath(path.relative(canonicalRoot, fullPath));

      if (matchesIgnore(relPosix, ignore)) continue;

      // Never follow symlinks — prevents infinite loops & arbitrary file read outside repo
      if (entry.isSymbolicLink() || isSymlink(fullPath)) {
        state.skipped.push({ path: relPosix, reason: 'symlink-skipped' });
        continue;
      }

      if (entry.isDirectory()) {
        if (!isPathWithinRoot(canonicalRoot, fullPath)) {
          state.skipped.push({ path: relPosix, reason: 'outside-root' });
          continue;
        }
        recurse(fullPath, depth + 1);
      } else if (entry.isFile() && SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        if (!isPathWithinRoot(canonicalRoot, fullPath)) {
          state.skipped.push({ path: relPosix, reason: 'outside-root' });
          continue;
        }
        try {
          const st = statSync(fullPath);
          if (st.size > maxFileSizeBytes) {
            state.skipped.push({ path: relPosix, reason: 'file-too-large' });
            continue;
          }
        } catch {
          continue;
        }
        state.files.push(fullPath);
      }
    }
  }

  recurse(dir, 0);
  return state;
}
