import { processEngineeringAI } from './engineeringAI';

export type RootCauseReport = {
  rootCause: string;
  evidence: string[];
  impactedFiles: string[];
  confidenceScore: number;
  failureType: 'build' | 'deployment' | 'verification' | 'browser' | 'api' | 'health' | 'unknown';
};

const FILE_IN_ERROR = /(?:^|\s)([\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs))(?:\(|:|\s|$)/gm;
const TS_ERROR = /error TS\d+:\s*(.+)/i;
const MODULE_NOT_FOUND = /Cannot find module ['"]([^'"]+)['"]/i;

export function analyzeBuildFailure(output: string): RootCauseReport {
  const evidence: string[] = [];
  const impactedFiles = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = FILE_IN_ERROR.exec(output.slice(0, 8000)))) {
    const f = m[1];
    if (!f.includes('node_modules')) impactedFiles.add(f);
  }

  const ts = TS_ERROR.exec(output);
  const mod = MODULE_NOT_FOUND.exec(output);
  let rootCause = 'Build failed — inspect compiler output';
  let confidence = 55;

  if (ts) {
    rootCause = ts[1].trim().slice(0, 500);
    confidence = 75;
    evidence.push(ts[0]);
  } else if (mod) {
    rootCause = `Missing module: ${mod[1]}`;
    confidence = 80;
    evidence.push(mod[0]);
  } else {
    const firstLine = output.split('\n').find((l) => /error/i.test(l));
    if (firstLine) {
      rootCause = firstLine.trim().slice(0, 400);
      evidence.push(firstLine);
      confidence = 65;
    }
  }

  return {
    rootCause,
    evidence,
    impactedFiles: [...impactedFiles].slice(0, 5),
    confidenceScore: confidence,
    failureType: 'build',
  };
}

/** Flash log analysis when regex confidence is low or output is large. */
export async function enrichBuildFailureWithFlash(
  output: string,
  base: RootCauseReport,
  userId: number,
  taskId?: string
): Promise<RootCauseReport> {
  if (base.confidenceScore >= 78 || output.length < 1200) return base;
  try {
    const aiRes = await processEngineeringAI({
      engineeringTask: 'build_error_parse',
      prompt: `Extract build failure root cause from logs. Return JSON: {"rootCause":"string","impactedFiles":["path"],"confidence":0-100}\n\n${output.slice(0, 6000)}`,
      userId,
      taskId,
      skipCompression: true,
      overrides: { jsonMode: true, structuredOutput: true, maxTokens: 800 },
    });
    const s = aiRes.structured as {
      rootCause?: string;
      impactedFiles?: string[];
      confidence?: number;
    };
    if (s?.rootCause) {
      return {
        ...base,
        rootCause: String(s.rootCause).slice(0, 500),
        impactedFiles: Array.isArray(s.impactedFiles)
          ? s.impactedFiles.map(String).slice(0, 5)
          : base.impactedFiles,
        confidenceScore: Number.isFinite(Number(s.confidence))
          ? Number(s.confidence)
          : base.confidenceScore,
        evidence: [...base.evidence, 'source:flash_log_analysis'],
      };
    }
  } catch {
    /* keep regex RCA */
  }
  return base;
}

export function buildFixPromptFromRca(
  originalPrompt: string,
  rca: RootCauseReport,
  buildOutput: string
): string {
  const fileHint = rca.impactedFiles[0]
    ? `Focus ONLY on fixing: ${rca.impactedFiles[0]}`
    : 'Fix the first compiler error only';
  return [
    'BUILD FAILURE — fix mode (no new features).',
    fileHint,
    `Root cause: ${rca.rootCause}`,
    'Apply ONE minimal fix. Do not refactor unrelated code.',
    '',
    'Build output (truncated):',
    buildOutput.slice(0, 2500),
    '',
    `Original task (context only): ${originalPrompt.slice(0, 400)}`,
  ].join('\n');
}
