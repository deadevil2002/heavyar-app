export const LONG_RENTAL_THRESHOLD_MINUTES = 48 * 60;
export const LONG_RENTAL_REMINDER_LEAD_MINUTES = 24 * 60;
export const SHORT_RENTAL_REMINDER_MAX_LEAD_MINUTES = 60;
export const SHORT_RENTAL_REMINDER_MIN_LEAD_MINUTES = 15;

export type RentalExpiryReminderSchedule = {
  requestId: string;
  confirmedEndAt: string;
  dueAt: string;
  reminderKind: 'long_24h' | 'short_provisional';
  leadMinutes: number;
};

/**
 * Provisional short-rental policy: one quarter of the rental duration, clamped
 * to 15-60 minutes. Long rentals (48h+) receive the decided 24h reminder.
 */
export function rentalExpiryReminderSchedule(
  requestId: string,
  request: Record<string, any>,
  nowValue: string,
): RentalExpiryReminderSchedule | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId) || request.pricingModelVersion !== 2
      || !['hourly', 'daily'].includes(String(request.rentalMode))) return null;
  const start = Date.parse(String(request.requestedStartAt || ''));
  const end = Date.parse(String(request.requestedEndAt || ''));
  const now = Date.parse(nowValue);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now) || end <= start || end <= now) return null;
  const durationMinutes = Math.ceil((end - start) / 60_000);
  const longRental = durationMinutes >= LONG_RENTAL_THRESHOLD_MINUTES;
  const leadMinutes = longRental
    ? LONG_RENTAL_REMINDER_LEAD_MINUTES
    : Math.min(
      SHORT_RENTAL_REMINDER_MAX_LEAD_MINUTES,
      Math.max(SHORT_RENTAL_REMINDER_MIN_LEAD_MINUTES, Math.floor(durationMinutes / 4)),
    );
  const due = Math.max(now, end - leadMinutes * 60_000);
  return {
    requestId,
    confirmedEndAt: new Date(end).toISOString(),
    dueAt: new Date(due).toISOString(),
    reminderKind: longRental ? 'long_24h' : 'short_provisional',
    leadMinutes,
  };
}
