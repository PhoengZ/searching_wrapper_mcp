export class AppError extends Error {
  constructor(public readonly code: string, message = code) { super(message); this.name = 'AppError'; }
}
export function errorCode(error: unknown): string { return error instanceof AppError ? error.code : 'INTERNAL_ERROR'; }
export function toolError(error: unknown) {
  const code = errorCode(error);
  return { isError: true, content: [{ type: 'text' as const, text: code }] };
}
