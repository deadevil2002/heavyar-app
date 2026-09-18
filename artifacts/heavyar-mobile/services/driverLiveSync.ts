export type CursorPage<T> = {
  items: T[];
  nextCursor?: string;
};

export class LatestRequestGuard {
  private generation = 0;
  private controller?: AbortController;

  begin(): { generation: number; signal: AbortSignal } {
    this.controller?.abort();
    this.controller = new AbortController();
    this.generation += 1;
    return { generation: this.generation, signal: this.controller.signal };
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation && this.controller?.signal.aborted === false;
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.generation += 1;
  }
}

export function mergeUniqueById<T extends { id: string }>(current: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map(current.map(item => [item.id, item]));
  incoming.forEach(item => byId.set(item.id, item));
  return [...byId.values()];
}

/** Refetches exactly the number of pages already exposed to the user. */
export async function refreshLoadedPages<T>(
  pageCount: number,
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
): Promise<{ items: T[]; nextCursor?: string; pagesFetched: number }> {
  const items: T[] = [];
  let cursor: string | undefined;
  let pagesFetched = 0;
  const requestedPages = Math.max(1, pageCount);

  while (pagesFetched < requestedPages) {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    pagesFetched += 1;
    cursor = page.nextCursor;
    if (!cursor) break;
  }

  return { items, nextCursor: cursor, pagesFetched };
}