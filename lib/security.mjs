import { lstatSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export const LIMITS = Object.freeze({
  MAX_FILE_SIZE_BYTES: 1024 * 1024, // 1 MiB per source file
  MAX_FILES: 10_000,
  MAX_DEPTH: 32,
  MAX_SNIPPET_LENGTH: 120,
});

export class ScanError extends Error {
  constructor(message, code = 'SCAN_ERROR') {
    super(message);
    this.name = 'ScanError';
    this.code = code;
  }
}

/**
 * Strips ANSI escape sequences (CSI, OSC, DCS) and dangerous C0/C1 control
 * characters from untrusted strings before writing to a terminal.
 * Prevents CWE-150 (Terminal Escape Injection / Output Spoofing).
 */
export function sanitizeForTerminal(input) {
  if (typeof input !== 'string') return '';
  return (
    input
      // OSC sequences: ESC ] ... (BEL or ST)
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      // CSI sequences: ESC [ ... final byte
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      // Other 2-byte ESC sequences
      .replace(/\x1b[@-Z\\-_]/g, '')
      // Remaining C0/C1 control chars except newline and tab
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
  );
}

/**
 * Normalizes any OS file path to POSIX forward slashes for deterministic
 * cross-platform reports, SARIF URIs, and IDE links.
 */
export function toPosixPath(filePath) {
  return String(filePath).split(path.sep).join('/');
}

/**
 * Validates that targetDir exists and is a readable directory, returning its
 * canonical real path.
 */
export function resolveTargetDirectory(targetDir) {
  if (typeof targetDir !== 'string' || targetDir.trim() === '') {
    throw new ScanError('Target directory path must be a non-empty string.', 'INVALID_PATH');
  }
  const resolved = path.resolve(targetDir);
  let stats;
  try {
    stats = statSync(resolved);
  } catch (err) {
    throw new ScanError(`Directory does not exist or is not accessible: ${resolved}`, 'ENOENT');
  }
  if (!stats.isDirectory()) {
    throw new ScanError(`Target path is not a directory: ${resolved}`, 'ENOTDIR');
  }
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/**
 * Returns true if candidatePath (after resolving symlinks) stays strictly
 * inside canonicalRoot. Prevents symlink escape / path traversal.
 */
export function isPathWithinRoot(canonicalRoot, candidatePath) {
  let realCandidate;
  try {
    realCandidate = realpathSync(candidatePath);
  } catch {
    return false;
  }
  const rel = path.relative(canonicalRoot, realCandidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Checks if a path is a symbolic link without following it.
 */
export function isSymlink(filePath) {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Safely parses JSON while stripping __proto__, constructor, and prototype
 * keys to prevent prototype pollution from untrusted config/package files.
 */
export function safeJsonParse(rawText) {
  if (typeof rawText !== 'string') return null;
  return JSON.parse(rawText, (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return undefined;
    }
    return value;
  });
}
