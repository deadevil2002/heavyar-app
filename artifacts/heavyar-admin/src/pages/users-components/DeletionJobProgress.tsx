import { useDeletionJobStatus } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

export function DeletionJobProgress({ jobId, onDismiss }: { jobId: string, onDismiss: () => void }) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { data: job } = useDeletionJobStatus(jobId);

  if (!job) return null;

  const percentage = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;
  const isTerminal = job.status === 'completed' || job.status === 'failed' || job.status === 'partially_completed';
  const skippedCount = (job.result?.skipped_protected || 0) + (job.result?.skipped || 0);

  return (
    <div className="bg-card border rounded-md p-4 mb-6 shadow-sm flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1">
        {job.status === 'completed' && skippedCount === 0 ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : job.status === 'partially_completed' || (job.status === 'completed' && skippedCount > 0) ? (
          <AlertCircle className="h-5 w-5 text-amber-500" />
        ) : job.status === 'failed' ? (
          <XCircle className="h-5 w-5 text-destructive" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        )}

        <div className="flex-1 space-y-1">
          <div className="flex justify-between items-center text-sm font-medium">
            <span>
              {job.status === 'completed' ? t('اكتمل الحذف', 'Deletion completed') :
               job.status === 'partially_completed' ? t('اكتمل الحذف جزئياً', 'Deletion partially completed') :
               job.status === 'failed' ? t('فشل الحذف', 'Deletion failed') :
               t('جاري الحذف...', 'Deleting...')}

              {skippedCount > 0 && isTerminal && (
                <span className="text-amber-500 ms-2 text-xs font-normal">
                  ({t(`تم تخطي ${skippedCount} حسابات`, `${skippedCount} accounts skipped`)})
                </span>
              )}
            </span>
            <span className="text-muted-foreground">{job.progress} / {job.total}</span>
          </div>

          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${job.status === 'failed' ? 'bg-destructive' : (job.status === 'partially_completed' || skippedCount > 0) ? 'bg-amber-500' : 'bg-primary'}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>

      {isTerminal && (
        <button onClick={onDismiss} className="text-sm text-muted-foreground hover:text-foreground">
          {t('إغلاق', 'Dismiss')}
        </button>
      )}
    </div>
  );
}