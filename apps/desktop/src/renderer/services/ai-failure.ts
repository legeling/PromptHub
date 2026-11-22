export class AIHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export class AIResponseError extends Error {}

export function analysisFailureKey(error: unknown): string {
  if (error instanceof AIResponseError || error instanceof SyntaxError) return "answer";
  if (error instanceof AIHttpError) {
    if (error.status === 401 || error.status === 403) return "credentials";
    if (error.status === 404) return "endpoint";
    if (error.status === 429) return "limited";
    if (error.status === 408 || error.status === 504) return "timeout";
  }
  if (error instanceof Error && /timed?\s*out|timeout/i.test(error.message)) return "timeout";
  return "request";
}
