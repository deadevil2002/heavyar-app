import { RequestStatus } from '@/types';

export const REQUEST_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completion_requested'],
  completion_requested: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};

export function canTransition(
  current: RequestStatus,
  next: RequestStatus,
  actor: 'customer' | 'provider',
): boolean {
  if (!REQUEST_TRANSITIONS[current].includes(next)) return false;
  // Acceptance, rejection, starting, and completion request are provider actions.
  if (['accepted', 'rejected', 'in_progress', 'completion_requested'].includes(next)) {
    return actor === 'provider';
  }
  // Only the original customer/request initiator confirms completion.
  if (next === 'completed') return actor === 'customer';
  // A customer or provider may cancel, but nobody may mutate a terminal state.
  return next === 'cancelled' && ['pending', 'accepted'].includes(current);
}