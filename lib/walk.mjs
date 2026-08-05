import { readdirSync } from 'node:fs';
import path from 'node:path';

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.vscode', 'out']);

// Recursively find every source file worth scanning, skipping the folders
// that would otherwise make this slow or noisy (build output, deps, etc.)
export function walkFiles(dir, results = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results; // folder doesn't exist — fine, just skip it
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
    } else if (SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}
