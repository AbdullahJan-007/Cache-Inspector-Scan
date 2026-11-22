import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { safeJsonParse, ScanError } from './security.mjs';

const CONFIG_FILENAMES = ['.cacheinspectorrc.json', 'cache-inspector.config.json'];
const VALID_SEVERITIES = new Set(['high', 'medium', 'low', 'off']);
const VALID_FAIL_ON = new Set(['high', 'medium', 'low', 'none']);

export const DEFAULT_CONFIG = Object.freeze({
  roots: ['app', 'src/app', 'pages', 'src/pages', 'lib', 'src/lib', 'actions', 'src/actions'],
  ignore: [],
  rules: Object.create(null),
  failOn: 'high',
});

/**
 * Loads and validates optional project configuration from targetDir.
 * Never executes arbitrary JS — strictly JSON-only for supply-chain safety.
 */
export function loadConfig(targetDir, overrides = {}) {
  const config = {
    roots: [...DEFAULT_CONFIG.roots],
    ignore: [],
    rules: Object.create(null),
    failOn: DEFAULT_CONFIG.failOn,
    configFile: null,
  };

  for (const name of CONFIG_FILENAMES) {
    const candidate = path.join(targetDir, name);
    if (!existsSync(candidate)) continue;
    let parsed;
    try {
      parsed = safeJsonParse(readFileSync(candidate, 'utf8'));
    } catch (err) {
      throw new ScanError(`Invalid JSON in ${name}: ${err.message}`, 'INVALID_CONFIG');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ScanError(`Configuration in ${name} must be a JSON object.`, 'INVALID_CONFIG');
    }

    if (Array.isArray(parsed.roots)) {
      config.roots = parsed.roots.filter((r) => typeof r === 'string' && !r.includes('..') && !path.isAbsolute(r));
    }
    if (Array.isArray(parsed.ignore)) {
      config.ignore = parsed.ignore.filter((p) => typeof p === 'string' && p.trim().length > 0);
    }
    if (parsed.rules && typeof parsed.rules === 'object' && !Array.isArray(parsed.rules)) {
      for (const [ruleId, level] of Object.entries(parsed.rules)) {
        if (typeof level === 'string' && VALID_SEVERITIES.has(level.toLowerCase())) {
          config.rules[ruleId] = level.toLowerCase();
        }
      }
    }
    if (typeof parsed.failOn === 'string' && VALID_FAIL_ON.has(parsed.failOn.toLowerCase())) {
      config.failOn = parsed.failOn.toLowerCase();
    }
    config.configFile = name;
    break;
  }

  // Apply CLI / programmatic overrides
  if (Array.isArray(overrides.ignore) && overrides.ignore.length > 0) {
    config.ignore = [...config.ignore, ...overrides.ignore];
  }
  if (overrides.rules && typeof overrides.rules === 'object') {
    for (const [ruleId, level] of Object.entries(overrides.rules)) {
      if (typeof level === 'string' && VALID_SEVERITIES.has(level.toLowerCase())) {
        config.rules[ruleId] = level.toLowerCase();
      }
    }
  }
  if (typeof overrides.failOn === 'string' && VALID_FAIL_ON.has(overrides.failOn.toLowerCase())) {
    config.failOn = overrides.failOn.toLowerCase();
  }
  if (Array.isArray(overrides.roots) && overrides.roots.length > 0) {
    config.roots = overrides.roots.filter((r) => typeof r === 'string' && !r.includes('..') && !path.isAbsolute(r));
  }

  return config;
}
