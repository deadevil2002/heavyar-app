export type ListingLifecycleAction = 'archive' | 'delete';

export function listingLifecyclePath(id: string, action: ListingLifecycleAction): string {
  const encoded = encodeURIComponent(id);
  return action === 'archive' ? `/api/listings/${encoded}/archive` : `/api/listings/${encoded}`;
}

export function lifecycleOutcomeMessage(outcome: { action: string; preservedRentalHistory?: boolean }): 'archived_history' | 'archived' | 'deleted' {
  if (outcome.action === 'archived' && outcome.preservedRentalHistory) return 'archived_history';
  return outcome.action === 'archived' ? 'archived' : 'deleted';
}

export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}