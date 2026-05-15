/**
 * Free-form query → CardIdentity.
 *
 * Strategy:
 *   1. Heuristic regex pass first — fast, deterministic, no external call.
 *      Extracts year, grader, grade, and a likely parallel.
 *   2. If required fields are missing (player, setName), call the OpenAI
 *      client to fill in the gaps. The LLM gets the original query plus
 *      whatever the regex pass already pulled out.
 *   3. Apply the explicit `grade` override if the caller provided one.
 *
 * The OpenAI call is wrapped with a 5-second hard timeout (reliability
 * rule 8). On failure or missing API key, we return a partial result;
 * the route layer decides whether to proceed.
 */

import { z } from 'zod';
import { getOpenAiClient, getOpenAiModel } from '@/lib/openai/server';
import type { CardIdentity, Grade, Grader } from '@/lib/layer2/types';
import {
  findCommonParallel,
  normalizeAscii,
  parseGrade,
  parseYear,
} from '@/lib/layer2/identity/normalize';

export const LLM_TIMEOUT_MS = 5000;

export type ParsePartial = {
  player?: string;
  year?: number;
  setName?: string;
  cardNumber?: string;
  parallel?: string;
  isRookie?: boolean;
  isAutograph?: boolean;
  isPatch?: boolean;
  grader?: Grader;
  grade?: Grade;
};

export type ParseResult =
  | { ok: true; identity: CardIdentity; source: 'heuristic' | 'llm' }
  | { ok: false; reason: string; partial: ParsePartial };

/**
 * Pure heuristic pass. Exported separately so tests can target it
 * without touching the LLM path.
 */
export function heuristicParse(query: string): ParsePartial {
  const partial: ParsePartial = {};
  const year = parseYear(query);
  if (year != null) partial.year = year;
  const grade = parseGrade(query);
  if (grade) {
    partial.grader = grade.grader;
    partial.grade = grade.grade;
  }
  const parallel = findCommonParallel(query);
  if (parallel) partial.parallel = parallel;
  return partial;
}

/**
 * Merge a heuristic pass with any caller-supplied grade override. Caller
 * grade wins over what the regex extracted.
 */
function applyOverrides(partial: ParsePartial, gradeOverride?: string): ParsePartial {
  if (!gradeOverride) return partial;
  const g = parseGrade(gradeOverride);
  if (!g) return partial;
  return { ...partial, grader: g.grader, grade: g.grade };
}

function isComplete(p: ParsePartial): p is Required<Pick<ParsePartial, 'player' | 'year' | 'setName' | 'grader' | 'grade'>> & ParsePartial {
  return (
    typeof p.player === 'string' &&
    p.player.length > 0 &&
    typeof p.year === 'number' &&
    typeof p.setName === 'string' &&
    p.setName.length > 0 &&
    typeof p.grader === 'string' &&
    typeof p.grade === 'string'
  );
}

function toIdentity(p: ParsePartial): CardIdentity {
  return {
    player: p.player!,
    year: p.year!,
    setName: p.setName!,
    cardNumber: p.cardNumber,
    parallel: p.parallel,
    isRookie: p.isRookie ?? false,
    isAutograph: p.isAutograph ?? false,
    isPatch: p.isPatch ?? false,
    grader: p.grader!,
    grade: p.grade!,
  };
}

const LlmSchema = z.object({
  player: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  setName: z.string().min(1),
  cardNumber: z.string().nullable().optional(),
  parallel: z.string().nullable().optional(),
  isRookie: z.boolean().optional(),
  isAutograph: z.boolean().optional(),
  isPatch: z.boolean().optional(),
  grader: z.enum(['PSA', 'BGS', 'SGC', 'CGC', 'RAW']).optional(),
  grade: z.string().optional(),
});

/**
 * Wrap a promise with a hard timeout. Rejects if neither the input nor a
 * single retry resolves before `LLM_TIMEOUT_MS`.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function llmFillGaps(query: string, partial: ParsePartial): Promise<ParsePartial | null> {
  const client = getOpenAiClient();
  const model = getOpenAiModel();

  const system =
    'You parse sports-card lookup queries into structured identity. ' +
    'Domain conventions: years are 4 digits; set names are full marketing names ' +
    '(e.g. "Panini Prizm", "Topps Chrome", "Bowman Chrome"); parallels are the ' +
    'tinting variant name with optional print run; graders are PSA/BGS/SGC/CGC/RAW. ' +
    'Player names use accented spelling when known (e.g. "Luka Dončić"). ' +
    'Output JSON only, no prose.';

  const user = JSON.stringify({
    query,
    alreadyExtracted: partial,
    requiredFields: ['player', 'year', 'setName'],
    optionalFields: ['cardNumber', 'parallel', 'isRookie', 'isAutograph', 'isPatch', 'grader', 'grade'],
  });

  const completionPromise = client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const completion = await withTimeout(completionPromise, LLM_TIMEOUT_MS, 'identity llm parse');
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const valid = LlmSchema.safeParse(parsed);
  if (!valid.success) return null;

  // Merge: LLM fills only missing fields, heuristic values win where set.
  const merged: ParsePartial = { ...partial };
  for (const [k, v] of Object.entries(valid.data) as [keyof ParsePartial, unknown][]) {
    if (v == null) continue;
    if (merged[k] != null) continue;
    // Safe cast: LlmSchema constrains v to the legal shape for k.
    (merged as Record<string, unknown>)[k as string] = v;
  }
  return merged;
}

/**
 * Public entry. Returns either a fully-resolved `CardIdentity` or a
 * partial with a reason explaining what's missing.
 */
export async function parseQuery(
  query: string,
  gradeOverride?: string,
): Promise<ParseResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Empty query', partial: {} };
  }

  const heuristic = applyOverrides(heuristicParse(trimmed), gradeOverride);
  if (isComplete(heuristic)) {
    return { ok: true, identity: toIdentity(heuristic), source: 'heuristic' };
  }

  // Try the LLM fill-in. On any failure (env missing, timeout, schema
  // mismatch), surface a partial result rather than throw — the route
  // layer decides whether INSUFFICIENT_DATA is the right user message.
  try {
    const filled = await llmFillGaps(normalizeAscii(trimmed), heuristic);
    if (filled && isComplete(filled)) {
      return { ok: true, identity: toIdentity(filled), source: 'llm' };
    }
    return {
      ok: false,
      reason: 'Identity parse incomplete after heuristic + LLM pass',
      partial: filled ?? heuristic,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return {
      ok: false,
      reason: `LLM parse unavailable: ${msg}`,
      partial: heuristic,
    };
  }
}
