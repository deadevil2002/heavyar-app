import type { RentalSummary } from '@/types';
import { decodeRentalSummary, reportInvalidRentalMoney } from './rentalV2';
import { request, WorkerError } from './workerRequest';

export async function getRentalSummary(requestId: string): Promise<RentalSummary> {
  const result = await request<RentalSummary | { success: true; serverNow: string; summary: RentalSummary }>(
    `/api/requests/${encodeURIComponent(requestId)}/rental-summary`,
  );
  const raw = 'summary' in result ? { ...result.summary, serverNow: result.serverNow } : result;
  const decoded = decodeRentalSummary(raw);
  if (!decoded) {
    reportInvalidRentalMoney({ context: 'rental_summary', code: 'INVALID_RENTAL_SUMMARY', fields: ['summary'], requestId });
    throw new WorkerError('Invalid rental summary response', 502, 'INVALID_RENTAL_SUMMARY');
  }
  return decoded;
}
