export const PUBLIC_IDENTIFIER_FIELDS = {
  request: 'publicRequestNumber',
  equipment: 'publicEquipmentNumber',
} as const;

export type PublicIdentifierKind = keyof typeof PUBLIC_IDENTIFIER_FIELDS;

export const PUBLIC_IDENTIFIER_COUNTER_IDS: Record<PublicIdentifierKind, string> = {
  request: 'requests',
  equipment: 'equipment',
};

const PREFIX: Record<PublicIdentifierKind, string> = {
  request: 'HV-REQ',
  equipment: 'HV-EQP',
};

export function formatPublicIdentifier(kind: PublicIdentifierKind, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999999999999) {
    throw new Error('Invalid public identifier sequence');
  }
  return `${PREFIX[kind]}-${String(sequence).padStart(6, '0')}`;
}

export function isPublicIdentifier(kind: PublicIdentifierKind, value: unknown): value is string {
  return typeof value === 'string'
    && new RegExp(`^${PREFIX[kind]}-[0-9]{6,12}$`).test(value);
}

/**
 * The caller supplies the transaction-aware allocation primitive because this
 * module deliberately has no Firestore SDK dependency. `assignAtomically`
 * must reserve a counter sequence and conditionally write the target in one
 * database transaction. Gaps caused by failed/abandoned transactions are
 * acceptable; duplicate or reassigned identifiers are not.
 */
export type PublicIdentifierBackfillStore<T> = {
  readTarget(): Promise<T | null>;
  readIdentifier(target: T): unknown;
  assignAtomically(): Promise<string>;
};

export type PublicIdentifierBackfillResult = {
  identifier: string;
  assigned: boolean;
};

/**
 * Idempotent backfill wrapper for trusted admin/server handlers. It never
 * replaces a valid identifier already present on the target document. A CAS
 * loss is resolved by re-reading the target before retrying allocation.
 */
export async function ensurePublicIdentifier<T>(
  kind: PublicIdentifierKind,
  store: PublicIdentifierBackfillStore<T>,
  maxAttempts = 4,
): Promise<PublicIdentifierBackfillResult> {
  const attempts = Math.max(1, Math.min(8, Math.floor(maxAttempts)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const before = await store.readTarget();
    if (!before) throw new Error('Backfill target not found');
    const existing = store.readIdentifier(before);
    if (isPublicIdentifier(kind, existing)) return { identifier: existing, assigned: false };
    try {
      const identifier = await store.assignAtomically();
      if (!isPublicIdentifier(kind, identifier)) throw new Error('Invalid allocated public identifier');
      return { identifier, assigned: true };
    } catch (error) {
      const after = await store.readTarget();
      const resolved = after && store.readIdentifier(after);
      if (isPublicIdentifier(kind, resolved)) return { identifier: resolved, assigned: false };
      if (attempt === attempts - 1) throw error;
    }
  }
  throw new Error('Public identifier allocation failed');
}