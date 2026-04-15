import { APIError } from 'openai';

export type OpenAiFailureKind =
  | 'openai_quota_billing'
  | 'openai_rate_limit'
  | 'openai_invalid_key'
  | 'openai_permission'
  | 'openai_unknown';

const QUOTA_HINTS = /\b(quota|billing|plan|insufficient[_\s-]*quota|exceeded your current quota)\b/i;

export function classifyOpenAiHttpError(
  status: number | undefined,
  message: string,
  code: string | null | undefined,
): OpenAiFailureKind {
  if (status === 401) return 'openai_invalid_key';
  if (status === 403) return 'openai_permission';
  if (status === 429) {
    const codeStr = code ?? '';
    if (codeStr === 'insufficient_quota' || QUOTA_HINTS.test(message) || QUOTA_HINTS.test(codeStr)) {
      return 'openai_quota_billing';
    }
    return 'openai_rate_limit';
  }
  return 'openai_unknown';
}

export function userMessageForOpenAiFailure(kind: OpenAiFailureKind): string {
  switch (kind) {
    case 'openai_quota_billing':
      return 'Extraction could not run because the OpenAI API project has no available quota or billing is not active.';
    case 'openai_rate_limit':
      return 'Extraction could not run because the OpenAI API rate limit was hit. Wait a moment and try again.';
    case 'openai_invalid_key':
      return 'Extraction could not run because the OpenAI API key is missing or invalid. Check server environment configuration.';
    case 'openai_permission':
      return 'Extraction could not run because the OpenAI API key is not allowed to use this resource. Check project permissions.';
    default:
      return 'Extraction could not run due to an OpenAI API error. Check server logs and API configuration.';
  }
}

/** Safe JSON for server logs (no secrets). */
export function serializeOpenAiApiError(err: unknown): Record<string, unknown> {
  if (err instanceof APIError) {
    const body = err.error;
    return {
      name: err.name,
      status: err.status,
      code: err.code ?? null,
      type: err.type,
      param: err.param ?? null,
      requestId: err.requestID ?? null,
      message: err.message,
      errorBody:
        body && typeof body === 'object'
          ? (body as Record<string, unknown>)
          : body === undefined
            ? null
            : String(body),
    };
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { value: String(err) };
}
