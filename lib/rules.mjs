import { analyzeSource, extractSuppressions, offsetToLineColumn } from './lexer.mjs';
import {
  findFetchCalls,
  hasExplicitCacheConfig,
  detectConflictingCacheConfig,
  isMutatingMethod,
} from './fetch-scanner.mjs';
import { checkMissingInvalidation } from './action-scanner.mjs';
import { explainDefaultBehavior, severityForMissingCache } from './next-version.mjs';
import { LIMITS } from './security.mjs';

export const RULE_CATALOG = Object.freeze({
  CI001: {
    id: 'CI001',
    type: 'missing-cache-option',
    title: 'Missing explicit fetch() cache configuration',
    defaultSeverity: 'high',
    docsUrl: 'https://nextjs.org/docs/app/api-reference/functions/fetch',
  },
  CI002: {
    id: 'CI002',
    type: 'possible-missing-invalidation',
    title: 'Server Action without cache invalidation',
    defaultSeverity: 'medium',
    docsUrl: 'https://nextjs.org/docs/app/api-reference/functions/revalidateTag',
  },
  CI003: {
    id: 'CI003',
    type: 'conflicting-cache-options',
    title: 'Conflicting cache and revalidate options in fetch()',
    defaultSeverity: 'high',
    docsUrl: 'https://nextjs.org/docs/app/api-reference/functions/fetch',
  },
  CI004: {
    id: 'CI004',
    type: 'route-handler-get-caching',
    title: 'GET Route Handler without explicit caching config',
    defaultSeverity: 'high',
    docsUrl: 'https://nextjs.org/docs/app/api-reference/file-conventions/route',
  },
  CI005: {
    id: 'CI005',
    type: 'dynamic-api-with-force-static',
    title: 'Dynamic server API used with force-static segment config',
    defaultSeverity: 'high',
    docsUrl: 'https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config',
  },
  CI006: {
    id: 'CI006',
    type: 'use-cache-without-cache-life',
    title: "'use cache' directive without explicit cacheLife() or cacheTag()",
    defaultSeverity: 'low',
    docsUrl: 'https://nextjs.org/docs/app/api-reference/directives/use-cache',
  },
});

function hasDirective(analyzed, directiveText) {
  return analyzed.stringLiterals.find((lit) => lit.value === directiveText) || null;
}

function isRouteHandlerFile(relPosixPath) {
  return /(?:^|\/)route\.(?:[cm]?[jt]sx?)$/.test(relPosixPath);
}

function isPagesRouterFile(relPosixPath) {
  return /^(?:src\/)?pages\//.test(relPosixPath);
}

function hasRouteSegmentCacheConfig(analyzed) {
  const { codeOnly } = analyzed;
  const hasDynamic = /\bexport\s+const\s+dynamic\s*=/.test(codeOnly);
  const hasRevalidate = /\bexport\s+const\s+revalidate\s*=/.test(codeOnly);
  const hasFetchCache = /\bexport\s+const\s+fetchCache\s*=/.test(codeOnly);
  return { hasDynamic, hasRevalidate, hasFetchCache, any: hasDynamic || hasRevalidate || hasFetchCache };
}

function makeSnippet(raw) {
  const compact = String(raw).replace(/\s+/g, ' ').trim();
  if (compact.length <= LIMITS.MAX_SNIPPET_LENGTH) return compact;
  return `${compact.slice(0, LIMITS.MAX_SNIPPET_LENGTH - 3)}...`;
}

function resolveSeverity(ruleId, computedSeverity, ruleOverrides) {
  if (!ruleOverrides) return computedSeverity;
  const override = ruleOverrides[ruleId];
  if (override === 'off') return null;
  if (override === 'high' || override === 'medium' || override === 'low') return override;
  return computedSeverity;
}

/**
 * Runs all caching rules on a single file's source text.
 */
export function runRulesOnSource({
  sourceText,
  relPath,
  nextVersion = null,
  ruleOverrides = null,
}) {
  const analyzed = analyzeSource(sourceText);
  const suppressions = extractSuppressions(analyzed.comments);
  const findings = [];

  const isClientComponent = Boolean(hasDirective(analyzed, 'use client'));
  const useCacheDirective = hasDirective(analyzed, 'use cache');
  const segmentConfig = hasRouteSegmentCacheConfig(analyzed);
  const isPages = isPagesRouterFile(relPath);

  function pushFinding(finding) {
    const finalSeverity = resolveSeverity(finding.ruleId, finding.severity, ruleOverrides);
    if (!finalSeverity) return;
    if (suppressions.isSuppressed(finding.ruleId, finding.line)) return;
    findings.push({
      file: relPath,
      ...finding,
      severity: finalSeverity,
    });
  }

  // --- Fetch-based rules (CI001 & CI003) ---
  // Skip browser client components and Pages Router for server fetch cache rules
  if (!isClientComponent && !isPages) {
    const fetchCalls = findFetchCalls(sourceText, analyzed);
    for (const call of fetchCalls) {
      // CI003: Conflicting cache options (applies even if route segment config exists)
      const conflictMsg = detectConflictingCacheConfig(call.fullCall, call.maskedCall);
      if (conflictMsg) {
        pushFinding({
          ruleId: 'CI003',
          type: 'conflicting-cache-options',
          line: call.lineNumber,
          column: call.column,
          endLine: call.endLine,
          endColumn: call.endColumn,
          snippet: makeSnippet(call.fullCall),
          message: conflictMsg,
          suggestion: "Use either `cache: 'no-store'` OR `next: { revalidate: <seconds> }`, not both.",
          severity: 'high',
        });
        continue;
      }

      // CI001: Missing explicit cache option on GET fetch
      if (isMutatingMethod(call.fullCall, call.maskedCall)) continue;
      if (useCacheDirective || segmentConfig.any) continue;
      if (!hasExplicitCacheConfig(call.fullCall, call.maskedCall)) {
        pushFinding({
          ruleId: 'CI001',
          type: 'missing-cache-option',
          line: call.lineNumber,
          column: call.column,
          endLine: call.endLine,
          endColumn: call.endColumn,
          snippet: makeSnippet(call.fullCall),
          message: explainDefaultBehavior(nextVersion),
          suggestion: "Add `{ cache: 'force-cache' }`, `{ next: { revalidate: 60 } }`, or `{ cache: 'no-store' }`.",
          severity: severityForMissingCache(nextVersion),
        });
      }
    }
  }

  // --- CI002: Server Action missing invalidation ---
  const invalidationFinding = checkMissingInvalidation(sourceText, analyzed);
  if (invalidationFinding) {
    pushFinding({
      ...invalidationFinding,
      snippet: "'use server'",
    });
  }

  // --- CI004: App Router GET Route Handler without explicit caching ---
  if (!isClientComponent && !isPages && isRouteHandlerFile(relPath)) {
    const getMatch = analyzed.codeOnly.match(/\bexport\s+(?:async\s+)?(?:function\s+GET\b|const\s+GET\s*=)/);
    if (getMatch && !segmentConfig.hasDynamic && !segmentConfig.hasRevalidate && !useCacheDirective) {
      const loc = offsetToLineColumn(analyzed.lineStarts, getMatch.index);
      const major = typeof nextVersion === 'object' && nextVersion !== null ? nextVersion.major : nextVersion;
      const severity = major === null ? 'medium' : major >= 15 ? 'high' : 'low';
      const explanation =
        major !== null && major >= 15
          ? `Next.js ${major}: GET Route Handlers are NOT cached by default (changed in Next.js 15). Add \`export const dynamic = 'force-static'\` or \`export const revalidate = 60\` if you expect caching.`
          : major !== null
            ? `Next.js ${major}: GET Route Handlers are cached by default. Add \`export const dynamic = 'force-dynamic'\` if you expect fresh responses.`
            : "GET Route Handler has no explicit `export const dynamic` or `export const revalidate` config.";
      pushFinding({
        ruleId: 'CI004',
        type: 'route-handler-get-caching',
        line: loc.line,
        column: loc.column,
        snippet: makeSnippet(sourceText.slice(getMatch.index, getMatch.index + 60)),
        message: explanation,
        suggestion: "Export `export const dynamic = 'force-static'` or `export const dynamic = 'force-dynamic'`.",
        severity,
      });
    }
  }

  // --- CI005: force-static combined with dynamic server APIs ---
  if (!isClientComponent && !isPages) {
    const hasForceStatic =
      /\bexport\s+const\s+dynamic\s*=\s*['"`]force-static['"`]/.test(sourceText) &&
      /\bexport\s+const\s+dynamic\s*=/.test(analyzed.codeOnly);
    if (hasForceStatic) {
      const dynApiMatch = analyzed.codeOnly.match(/\b(cookies|headers|draftMode)\s*\(/);
      if (dynApiMatch) {
        const loc = offsetToLineColumn(analyzed.lineStarts, dynApiMatch.index);
        pushFinding({
          ruleId: 'CI005',
          type: 'dynamic-api-with-force-static',
          line: loc.line,
          column: loc.column,
          snippet: `${dynApiMatch[1]}()`,
          message: `Calling \`${dynApiMatch[1]}()\` in a route with \`export const dynamic = 'force-static'\` returns empty values or breaks static rendering.`,
          suggestion: "Remove `export const dynamic = 'force-static'` or avoid request-bound APIs in static routes.",
          severity: 'high',
        });
      }
    }
  }

  // --- CI006: 'use cache' without cacheLife() or cacheTag() ---
  if (useCacheDirective && !isClientComponent) {
    const hasCacheLifeOrTag = /\b(cacheLife|cacheTag)\s*\(/.test(analyzed.codeOnly);
    if (!hasCacheLifeOrTag) {
      pushFinding({
        ruleId: 'CI006',
        type: 'use-cache-without-cache-life',
        line: useCacheDirective.line,
        column: 1,
        snippet: "'use cache'",
        message: "This file uses `'use cache'` without calling `cacheLife()` or `cacheTag()`. Setting an explicit lifetime and tag prevents unpredictable stale data.",
        suggestion: "Call `cacheLife('minutes')` and/or `cacheTag('my-tag')` inside your cached scope.",
        severity: 'low',
      });
    }
  }

  return findings;
}
