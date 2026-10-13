import { describe, expect, it } from 'bun:test';
import { rentalExpiryReminderSchedule } from './rental-expiry';

describe('rental expiry reminder schedule', () => {
  it('uses the server clock and schedules long rentals about 24 hours before expiry', () => {
    expect(rentalExpiryReminderSchedule('request_1', {
      pricingModelVersion: 2, rentalMode: 'daily',
      requestedStartAt: '2030-09-20T00:00:00.000Z', requestedEndAt: '2030-09-23T00:00:00.000Z',
    }, '2030-09-20T01:00:00.000Z')).toEqual({
      requestId: 'request_1', confirmedEndAt: '2030-09-23T00:00:00.000Z',
      dueAt: '2030-09-22T00:00:00.000Z', reminderKind: 'long_24h', leadMinutes: 1_440,
    });
  });

  it('uses a bounded provisional lead for short rentals', () => {
    expect(rentalExpiryReminderSchedule('request_2', {
      pricingModelVersion: 2, rentalMode: 'hourly',
      requestedStartAt: '2030-09-20T08:00:00.000Z', requestedEndAt: '2030-09-20T10:00:00.000Z',
    }, '2030-09-20T07:00:00.000Z')).toMatchObject({
      dueAt: '2030-09-20T09:30:00.000Z', reminderKind: 'short_provisional', leadMinutes: 30,
    });
  });

  it('schedules immediately when the ideal lead time is already reached', () => {
    expect(rentalExpiryReminderSchedule('request_3', {
      pricingModelVersion: 2, rentalMode: 'hourly',
      requestedStartAt: '2030-09-20T08:00:00.000Z', requestedEndAt: '2030-09-20T10:00:00.000Z',
    }, '2030-09-20T09:45:00.000Z')?.dueAt).toBe('2030-09-20T09:45:00.000Z');
  });

  it('suppresses legacy, open-ended, malformed, and already expired rentals', () => {
    const fixed = { pricingModelVersion: 2, rentalMode: 'hourly', requestedStartAt: '2030-09-20T08:00:00.000Z', requestedEndAt: '2030-09-20T10:00:00.000Z' };
    expect(rentalExpiryReminderSchedule('request_4', { ...fixed, pricingModelVersion: 1 }, '2030-09-20T07:00:00.000Z')).toBeNull();
    expect(rentalExpiryReminderSchedule('request_4', { ...fixed, rentalMode: 'open_ended', requestedEndAt: null }, '2030-09-20T07:00:00.000Z')).toBeNull();
    expect(rentalExpiryReminderSchedule('request_4', { ...fixed, requestedEndAt: 'bad' }, '2030-09-20T07:00:00.000Z')).toBeNull();
    expect(rentalExpiryReminderSchedule('request_4', fixed, '2030-09-20T10:00:00.000Z')).toBeNull();
  });
});
