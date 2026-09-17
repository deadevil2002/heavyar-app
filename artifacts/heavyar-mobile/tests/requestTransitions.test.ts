import { describe, expect, it } from 'vitest';
import { canTransition } from '../services/requestTransitions';

describe('request lifecycle transitions', () => {
  it.each([
    ['pending', 'accepted', 'provider'],
    ['pending', 'rejected', 'provider'],
    ['pending', 'cancelled', 'customer'],
    ['accepted', 'in_progress', 'provider'],
    ['accepted', 'cancelled', 'customer'],
    ['in_progress', 'completion_requested', 'provider'],
    ['completion_requested', 'completed', 'customer'],
  ] as const)('allows %s → %s by %s', (current, next, actor) => {
    expect(canTransition(current, next, actor)).toBe(true);
  });

  it.each([
    ['pending', 'accepted', 'customer'],
    ['pending', 'rejected', 'customer'],
    ['accepted', 'in_progress', 'customer'],
    ['in_progress', 'completed', 'provider'],
    ['completion_requested', 'completed', 'provider'],
    ['completed', 'cancelled', 'customer'],
    ['rejected', 'accepted', 'provider'],
    ['cancelled', 'in_progress', 'provider'],
  ] as const)('rejects %s → %s by %s', (current, next, actor) => {
    expect(canTransition(current, next, actor)).toBe(false);
  });

  it('does not allow a request initiator to self-confirm', () => {
    expect(canTransition('pending', 'accepted', 'customer')).toBe(false);
  });
});