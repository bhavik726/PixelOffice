export function toErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }

  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }

  return fallback;
}
