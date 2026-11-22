export type Severity = 'high' | 'medium' | 'low';
export type RuleLevel = Severity | 'off';
export type FailOnLevel = Severity | 'none';

export interface NextVersionInfo {
  major: number;
  minor: number;
  patch: number;
  raw: string;
  source: 'node_modules' | 'package.json';
}

export interface Finding {
  file: string;
  ruleId: string;
  type: string;
  line: number | null;
  column?: number;
  endLine?: number;
  endColumn?: number;
  snippet: string | null;
  message: string;
  suggestion?: string;
  severity: Severity;
}

export interface SkippedFile {
  path: string;
  reason: 'symlink-skipped' | 'outside-root' | 'file-too-large' | 'max-depth-exceeded' | 'unreadable';
}

export interface ScanSummary {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface ScanResult {
  schemaVersion: string;
  targetDir: string;
  nextVersion: number | null;
  nextVersionInfo: NextVersionInfo | null;
  configFile: string | null;
  failOn: FailOnLevel;
  rootsScanned: string[];
  filesScanned: number;
  filesSkipped: SkippedFile[];
  summary: ScanSummary;
  findings: Finding[];
}

export interface ScanOptions {
  roots?: string[];
  ignore?: string[];
  rules?: Record<string, RuleLevel>;
  failOn?: FailOnLevel;
  maxFiles?: number;
  maxDepth?: number;
  maxFileSizeBytes?: number;
}

export interface ScanSourceOptions {
  filePath?: string;
  nextVersion?: number | NextVersionInfo | null;
  rules?: Record<string, RuleLevel> | null;
}

export interface RuleDefinition {
  id: string;
  type: string;
  title: string;
  defaultSeverity: Severity;
  docsUrl: string;
}

export declare const RULE_CATALOG: Readonly<Record<string, RuleDefinition>>;
export declare const LIMITS: Readonly<{
  MAX_FILE_SIZE_BYTES: number;
  MAX_FILES: number;
  MAX_DEPTH: number;
  MAX_SNIPPET_LENGTH: number;
}>;

export declare class ScanError extends Error {
  code: string;
  constructor(message: string, code?: string);
}

export declare function scanProject(targetDir: string, options?: ScanOptions): ScanResult;
export declare function scanSource(sourceText: string, options?: ScanSourceOptions): Finding[];
export declare function detectNextVersion(targetDir: string): number | null;
export declare function detectNextVersionInfo(targetDir: string): NextVersionInfo | null;
export declare function explainDefaultBehavior(nextVersion: number | NextVersionInfo | null): string;
export declare function severityForMissingCache(nextVersion: number | NextVersionInfo | null): Severity;
export declare function formatReport(result: ScanResult, options?: { useColor?: boolean }): string;
export declare function formatJson(result: ScanResult): string;
export declare function formatSarif(result: ScanResult, toolVersion?: string): string;
export declare function formatGithub(result: ScanResult): string;
export declare function shouldFail(findings: Finding[], failOn?: FailOnLevel): boolean;
export declare function sanitizeForTerminal(input: string): string;
