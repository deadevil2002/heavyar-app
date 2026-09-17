import type { TrustFields, TrustStatus } from '@/lib/api';

const labels: Record<TrustStatus, [string, string]> = {
  verified: ['موثق', 'Identity verified'],
  pending: ['قيد التحقق', 'Verification pending'],
  rejected: ['مرفوض', 'Verification rejected'],
  expired: ['منتهي الصلاحية', 'Verification expired'],
  manual_review: ['مراجعة يدوية', 'Manual review'],
  restricted: ['مقيّد', 'Restricted'],
  unverified: ['غير موثق', 'Unverified'],
  require_verification: ['التحقق مطلوب', 'Verification required'],
  require_manual_review: ['المراجعة مطلوبة', 'Manual review required'],
  restrict: ['تقييد مطلوب', 'Restriction required'],
  block: ['محظور', 'Blocked'],
};

const classes: Record<TrustStatus, string> = {
  verified: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  rejected: 'bg-destructive/10 text-destructive',
  expired: 'bg-muted text-muted-foreground',
  manual_review: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  restricted: 'bg-destructive/10 text-destructive',
  unverified: 'bg-muted text-muted-foreground',
  require_verification: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  require_manual_review: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  restrict: 'bg-destructive/10 text-destructive',
  block: 'bg-destructive/10 text-destructive',
};

export function trustStatusOf(value?: TrustFields | null): TrustStatus | undefined {
  if (!value) return undefined;
  if (value.riskOutcome) return value.riskOutcome;
  if (value.manualReview?.status === 'manual_review') return 'manual_review';
  return value.overallTrust?.status ?? value.identity?.status ?? value.trustStatus ?? value.identityStatus ?? value.verificationStatus ??
    (value.verificationRequired ? 'require_verification' : undefined);
}

export function TrustIndicator({ value, language, compact = false }: { value?: TrustFields | null; language: 'ar' | 'en'; compact?: boolean }) {
  const status = trustStatusOf(value);
  if (!status) {
    return <span className="text-xs text-muted-foreground" data-testid="status-trust-unavailable">{language === 'ar' ? 'لا توجد بيانات ثقة' : 'Trust unavailable'}</span>;
  }
  const [ar, en] = labels[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${classes[status]}`} data-testid={`status-trust-${status}`}>
      {compact ? status : language === 'ar' ? ar : en}
    </span>
  );
}