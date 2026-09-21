/** Server request IDs only; never render arbitrary upstream text as a support code. */
export function safeSupportCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^(?:[A-F0-9]{10}|CLIENT-[A-Z0-9-]{3,48})$/.test(value) ? value : undefined;
}

export class MutationError extends Error {
  readonly supportCode: string;
  constructor(readonly code: string, readonly status = 0, supportCode?: unknown) {
    super('The operation could not be completed');
    this.name = 'MutationError';
    this.supportCode = safeSupportCode(supportCode) || `CLIENT-${code.replace(/[^A-Z0-9-]/g, '-').slice(0, 48)}`;
  }
}