/**
 * Store-backend-agnostic unique-constraint conflict. Prisma throws
 * `PrismaClientKnownRequestError` with `code: 'P2002'` for a real Postgres
 * unique-index violation; `MemoryStore` throws this shape directly to
 * mirror that exact contract so callers (routes/students.ts) can handle a
 * duplicate-insert race the same way regardless of which store is active.
 */
export class UniqueConstraintError extends Error {
  readonly code = 'P2002';
  constructor(readonly field: string) {
    super(`Unique constraint failed on the field: \`${field}\``);
  }
}

export function uniqueConstraintError(field: string): UniqueConstraintError {
  return new UniqueConstraintError(field);
}

export function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}
