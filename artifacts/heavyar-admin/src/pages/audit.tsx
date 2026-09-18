import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { useAudit } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Audit() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);
  
  const { data, isLoading } = useAudit({ limit: 50, ...(cursor ? { cursor } : {}) });
  const actionLabels: Record<string, [string, string]> = {
    commission_create: ['إنشاء إصدار للعمولات', 'Commission version created'],
    commission_publish: ['اعتماد إصدار للعمولات', 'Commission version published'],
    commission_retire: ['إيقاف إصدار للعمولات', 'Commission version retired'],
    owner_bootstrap: ['تم تفعيل المالك الأول للنظام', 'Initial system owner activated'],
    email_verification_reminder: ['إرسال تذكير توثيق البريد', 'Email verification reminder sent'],
    email_verification_reminder_bulk: ['إرسال تذكيرات توثيق البريد', 'Bulk email verification reminders sent'],
    user_deletion_queued: ['بدء حذف المستخدمين', 'User deletion queued'],
    user_deletion_job_terminal: ['اكتمال مهمة حذف المستخدمين', 'User deletion job completed'],
    approve_listing: ['اعتماد المعدة', 'Equipment approved'],
    reject_listing: ['رفض المعدة', 'Equipment rejected'],
    suspend_listing: ['إيقاف المعدة', 'Equipment suspended'],
    hide_equipment: ['إخفاء المعدة', 'Equipment hidden'],
    unhide_equipment: ['إظهار المعدة', 'Equipment restored'],
    approve_provider: ['اعتماد المزود', 'Provider approved'],
    reject_provider: ['رفض المزود', 'Provider rejected'],
    suspend_provider: ['إيقاف المزود', 'Provider suspended'],
    approve_driver: ['اعتماد السائق', 'Driver approved'],
    reject_driver: ['رفض السائق', 'Driver rejected'],
    suspend_driver: ['إيقاف السائق', 'Driver suspended'],
    reactivate_driver: ['إعادة تفعيل السائق', 'Driver reactivated'],
    reactivate_provider: ['إعادة تفعيل المزود', 'Provider reactivated'],
    staff_revoked: ['إلغاء صلاحيات الموظف', 'Staff access revoked'],
    archive_listing: ['أرشفة المعدة', 'Equipment archived'],
    delete_listing: ['إزالة المعدة نهائياً', 'Equipment permanently removed'],
    hide_listing: ['إخفاء المعدة', 'Equipment hidden'],
    show_listing: ['إظهار المعدة', 'Equipment shown'],
    rereview_listing: ['إعادة فتح مراجعة المعدة', 'Equipment review reopened'],
    flag_equipment: ['وضع علامة على المعدة', 'Equipment flagged'],
    suspend_equipment: ['إيقاف المعدة', 'Equipment suspended'],
    add_user_note: ['إضافة ملاحظة إدارية', 'Admin note added'],
    cancel_request: ['إلغاء الطلب', 'Request cancelled'],
    freeze_request: ['تجميد الطلب', 'Request frozen'],
    escalate_request: ['تصعيد الطلب', 'Request escalated'],
    investigate_request: ['بدء التحقيق في الطلب', 'Request investigation started'],
    add_request_note: ['إضافة ملاحظة على الطلب', 'Request note added'],
    review_complaint: ['بدء مراجعة الشكوى', 'Complaint review started'],
    resolve_complaint: ['حل الشكوى', 'Complaint resolved'],
    close_complaint: ['إغلاق الشكوى', 'Complaint closed'],
    add_complaint_note: ['إضافة ملاحظة على الشكوى', 'Complaint note added'],
    request_refund: ['طلب استرداد', 'Refund requested'],
    approve_refund: ['اعتماد الاسترداد', 'Refund approved'],
    reject_refund: ['رفض الاسترداد', 'Refund rejected'],
    update_provider_config: ['تحديث إعدادات مزود الخدمة', 'Provider configuration updated'],
    update_verification_policy: ['تحديث سياسة التحقق', 'Verification policy updated'],
    update_config: ['تحديث الإعدادات', 'Configuration updated'],
    update_auth_config: ['تحديث إعدادات المصادقة', 'Authentication configuration updated'],
    start_manual_review: ['بدء المراجعة اليدوية', 'Manual review started'],
    complete_manual_review: ['إكمال المراجعة اليدوية', 'Manual review completed'],
    reject_manual_review: ['رفض المراجعة اليدوية', 'Manual review rejected'],
    add_verification_note: ['إضافة ملاحظة تحقق', 'Verification note added'],
    set_provider_component: ['تحديث مكوّن تحقق المزود', 'Provider verification component updated'],
    set_provider_requirements: ['تحديث متطلبات تحقق المزود', 'Provider verification requirements updated'],
    staff_invitation_created: ['إنشاء دعوة موظف', 'Staff invitation created'],
    staff_invite_created: ['إنشاء دعوة موظف', 'Staff invitation created'],
    staff_invite_resent: ['إعادة إرسال دعوة موظف', 'Staff invitation resent'],
    staff_invitation_revoked: ['سحب دعوة موظف', 'Staff invitation revoked'],
    user_deletion_target_queued: ['إدراج مستخدم في قائمة الحذف', 'User deletion target queued'],
    user_deletion_target_terminal: ['اكتمال حذف مستخدم', 'User deletion target completed'],
    admin_export_downloaded: ['تنزيل تصدير إداري', 'Admin export downloaded'],
    public_identifier_backfilled: ['استكمال المعرف العام', 'Public identifier backfilled'],
    campaign_create: ['إنشاء حملة', 'Campaign created'],
    countries_updated: ['تحديث الدول', 'Countries updated'],
    email_verification_policy_updated: ['تحديث سياسة توثيق البريد', 'Email verification policy updated'],
    fx_provider_updated: ['تحديث مزود الصرف', 'FX provider updated'],
    ownership_transfer_created: ['إنشاء نقل الملكية', 'Ownership transfer created'],
    ownership_transfer_cancelled: ['إلغاء نقل الملكية', 'Ownership transfer cancelled'],
    ownership_transfer_accepted: ['قبول نقل الملكية', 'Ownership transfer accepted'],
    ownership_transfer_rejected: ['رفض نقل الملكية', 'Ownership transfer rejected'],
    ownership_transfer_initiated: ['بدء نقل الملكية', 'Ownership transfer initiated'],
    ownership_transfer_delivery_failed: ['فشل تسليم دعوة نقل الملكية', 'Ownership transfer delivery failed'],
    notification_retry: ['إعادة محاولة الإشعار', 'Notification retry'],
    notification_cleanup: ['تنظيف الإشعارات', 'Notification cleanup'],
    notification_delivery_retry: ['إعادة محاولة تسليم الإشعار', 'Notification delivery retry'],
    notification_delivery_cleanup: ['تنظيف سجلات تسليم الإشعارات', 'Notification delivery cleanup'],
    retention_cleanup: ['تنظيف الاحتفاظ بالبيانات', 'Retention cleanup'],
    verification_retention_cleanup: ['تنظيف سجلات التحقق القديمة', 'Verification retention cleanup'],
    staff_invite_delivery_failed: ['فشل تسليم دعوة الموظف', 'Staff invitation delivery failed'],
    phone_verification_policy_updated: ['تحديث سياسة توثيق الهاتف', 'Phone verification policy updated'],
    legacy_equipment_migration: ['ترحيل بيانات المعدات القديمة', 'Legacy equipment migration'],
    staff_invitation_cancelled: ['إلغاء دعوة موظف', 'Staff invitation cancelled'],
    staff_invitation_accepted: ['قبول دعوة موظف', 'Staff invitation accepted'],
    staff_invitation_resent: ['إعادة إرسال دعوة موظف', 'Staff invitation resent'],
    staff_invitation_expired: ['انتهاء دعوة موظف', 'Staff invitation expired'],
    staff_invitation_rejected: ['رفض دعوة موظف', 'Staff invitation rejected'],
    suspend_user: ['إيقاف مستخدم', 'User suspended'],
    unsuspend_user: ['إلغاء إيقاف مستخدم', 'User restored'],
    restore_provider: ['استعادة المزود', 'Provider restored'],
    restore_driver: ['استعادة السائق', 'Driver restored'],
    deletion_preview_created: ['إنشاء معاينة الحذف', 'Deletion preview created'],
    deletion_job_failed: ['فشل مهمة الحذف', 'Deletion job failed'],
    update_staff_roles: ['تحديث أدوار الموظف', 'Staff roles updated'],
  };
  const targetLabels: Record<string, [string, string]> = {
    user: ['مستخدم', 'User'],
    users: ['مستخدمون', 'Users'],
    provider: ['مزود', 'Provider'],
    driver: ['سائق', 'Driver'],
    equipment: ['معدة', 'Equipment'],
    request: ['طلب', 'Request'],
    complaint: ['شكوى', 'Complaint'],
    payment: ['دفعة', 'Payment'],
    refund: ['استرداد', 'Refund'],
    export: ['تصدير', 'Export'],
    country: ['دولة', 'Country'],
    currency: ['عملة', 'Currency'],
    gateway: ['بوابة دفع', 'Payment gateway'],
    security: ['أمان', 'Security'],
    deletionJob: ['مهمة حذف', 'Deletion job'],
    staffInvitation: ['دعوة موظف', 'Staff invitation'],
    ownershipTransfer: ['نقل ملكية', 'Ownership transfer'],
    configuration: ['إعدادات', 'Configuration'],
    commercialSettings: ['العمولات والرسوم', 'Fees & Commission'],
    campaign: ['حملة', 'Campaign'],
    notificationDelivery: ['تسليم إشعار', 'Notification delivery'],
    verificationAttempt: ['محاولة تحقق', 'Verification attempt'],
    driverProfile: ['ملف سائق', 'Driver profile'],
    providerProfile: ['ملف مزود', 'Provider profile'],
    verificationProfile: ['ملف تحقق', 'Verification profile'],
    providerConfig: ['إعدادات مزود الخدمة', 'Provider configuration'],
    staff: ['موظف', 'Staff member'],
    system: ['النظام', 'System'],
  };
  const localized = (map: Record<string, [string, string]>, value?: string) => {
    const row = value ? map[value] : undefined;
    return row ? t(row[0], row[1]) : value || t('غير محدد', 'Not specified');
  };

  const next = () => {
    if (data?.nextCursor) {
      setHistory([...history, cursor || '']);
      setCursor(data.nextCursor);
    }
  };

  const prev = () => {
    if (history.length > 0) {
      const newHistory = [...history];
      const prevCursor = newHistory.pop();
      setHistory(newHistory);
      setCursor(prevCursor === '' ? undefined : prevCursor);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('سجل التدقيق', 'Audit Log')}</h1>
        <p className="text-muted-foreground mt-1">{t('سجل غير قابل للتعديل للأحداث والقرارات', 'Append-only history of events and decisions')}</p>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="overflow-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-semibold text-foreground">{t('الوقت', 'Time')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('الفاعل', 'Actor')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('الإجراء', 'Action')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('الهدف', 'Target')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('السبب', 'Reason')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t('جاري التحميل...', 'Loading...')}
                  </TableCell>
                </TableRow>
              ) : data?.items?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t('لم يتم العثور على سجلات', 'No records found')}
                  </TableCell>
                </TableRow>
              ) : (
                data?.items?.map((item: any) => {
                   const actionLabel = localized(actionLabels, item.action);
                   const actorName = item.actorName || item.actorEmail || (item.actorType === 'system' || item.actorUid === 'system'
                     ? t('النظام', 'System')
                      : t('نظام / سجل قديم', 'System / Legacy record'));
                   const parsedTimestamp = new Date(item.timestamp);
                   const timestampLabel = Number.isNaN(parsedTimestamp.getTime())
                     ? t('تاريخ غير متاح', 'Date unavailable')
                     : parsedTimestamp.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US');

                  return (
                    <TableRow key={item.id} className="border-border border-b last:border-0 hover:bg-muted/20 text-sm">
                      <TableCell className="text-muted-foreground whitespace-nowrap">{timestampLabel}</TableCell>
                       <TableCell className="text-xs"><div className="font-medium">{actorName}</div>{item.actorEmail && <div dir="ltr" className="text-muted-foreground">{item.actorEmail}</div>}</TableCell>
                      <TableCell>
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-mono text-xs">{actionLabel}</span>
                      </TableCell>
                       <TableCell className="text-muted-foreground">{localized(targetLabels, item.targetType)}{item.targetId && <div dir="ltr" className="text-xs text-muted-foreground">{item.targetId}</div>}</TableCell>
                       <TableCell className="truncate max-w-[200px]" title={item.reason}>{item.reason || t('بدون سبب', 'No reason provided')}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={prev} disabled={history.length === 0} className="gap-2">
          {language === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {t('السابق', 'Previous')}
        </Button>
        <Button variant="outline" size="sm" onClick={next} disabled={!data?.nextCursor} className="gap-2">
          {t('التالي', 'Next')}
          {language === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
