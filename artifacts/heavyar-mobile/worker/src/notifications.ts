export const NOTIFICATION_CATEGORIES = [
  'rental', 'payment', 'verification', 'complaint', 'security', 'marketing',
] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
export type NotificationEvent =
  | 'rental_request_created' | 'rental_accepted' | 'rental_rejected'
  | 'rental_cancelled' | 'rental_starting' | 'completion_requested'
  | 'rental_completed' | 'payment_pending' | 'payment_confirmed'
  | 'payment_failed' | 'refund_updated' | 'verification_required'
  | 'verification_pending' | 'verification_completed' | 'manual_review_required'
  | 'verification_rejected' | 'verification_expired' | 'complaint_received'
  | 'complaint_response' | 'complaint_status_changed' | 'complaint_resolved'
  | 'account_suspended' | 'suspension_lifted' | 'account_restricted' | 'campaign_message';

const categoryFor = (event: NotificationEvent): NotificationCategory =>
  event.startsWith('rental_') || event === 'completion_requested' ? 'rental'
    : event.startsWith('payment_') || event === 'refund_updated' ? 'payment'
      : event.startsWith('verification_') || event === 'manual_review_required' ? 'verification'
        : event.startsWith('complaint_') ? 'complaint' : event === 'campaign_message' ? 'marketing' : 'security';
export const isCriticalCategory = (category: NotificationCategory) =>
  category === 'payment' || category === 'verification' || category === 'security';

const copy: Record<NotificationEvent, [string, string]> = {
  rental_request_created: ['طلب تأجير جديد', 'New rental request'],
  rental_accepted: ['تم قبول طلب التأجير', 'Rental request accepted'],
  rental_rejected: ['تم رفض طلب التأجير', 'Rental request declined'],
  rental_cancelled: ['تم إلغاء طلب التأجير', 'Rental request cancelled'],
  rental_starting: ['بدأ موعد التأجير', 'Rental is starting'],
  completion_requested: ['تم طلب إتمام التأجير', 'Completion requested'],
  rental_completed: ['اكتمل التأجير', 'Rental completed'],
  payment_pending: ['الدفع قيد المعالجة', 'Payment pending'],
  payment_confirmed: ['تم تأكيد الدفع', 'Payment confirmed'],
  payment_failed: ['تعذر إتمام الدفع', 'Payment failed'],
  refund_updated: ['تم تحديث حالة الاسترداد', 'Refund status updated'],
  verification_required: ['يلزم توثيق الهوية', 'Identity verification required'],
  verification_pending: ['التوثيق قيد المراجعة', 'Verification pending'],
  verification_completed: ['اكتمل توثيق الهوية', 'Identity verification completed'],
  manual_review_required: ['يتطلب الحساب مراجعة', 'Manual review required'],
  verification_rejected: ['تعذر توثيق الهوية', 'Identity verification rejected'],
  verification_expired: ['انتهت صلاحية التوثيق', 'Verification expired'],
  complaint_received: ['تم استلام الشكوى', 'Complaint received'],
  complaint_response: ['يوجد رد على الشكوى', 'Complaint response received'],
  complaint_status_changed: ['تغيرت حالة الشكوى', 'Complaint status changed'],
  complaint_resolved: ['تم حل الشكوى', 'Complaint resolved'],
  account_suspended: ['تم تعليق الحساب مؤقتاً', 'Account temporarily suspended'],
  suspension_lifted: ['تم رفع تعليق الحساب', 'Account suspension lifted'],
  account_restricted: ['تم تقييد بعض خصائص الحساب', 'Some account features are restricted'],
  campaign_message: ['رسالة من Heavyar', 'Message from Heavyar'],
};

export const allowedNotificationEvent = (v: unknown): v is NotificationEvent =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(copy, v);

export function notificationFields(uid: string, id: string, event: NotificationEvent, now: string, subjectId?: string, custom?: { titleAr?: string; titleEn?: string; bodyAr?: string; bodyEn?: string; imageUrl?: string; deepLink?: string }) {
  const category = categoryFor(event);
  const [titleAr, titleEn] = copy[event];
  const actionType = subjectId && /^[A-Za-z0-9_-]{1,100}$/.test(subjectId)
    ? (category === 'rental' ? 'request' : category === 'payment' ? 'payment' : category === 'verification' ? 'verification' : category === 'complaint' ? 'complaint' : 'profile')
    : 'profile';
  const actionFields: Record<string, any> = { type: { stringValue: actionType } };
  if (subjectId) actionFields.subjectId = { stringValue: subjectId };
  return {
    uid: { stringValue: uid }, event: { stringValue: event }, category: { stringValue: category },
    titleAr: { stringValue: custom?.titleAr || titleAr }, titleEn: { stringValue: custom?.titleEn || titleEn },
    bodyAr: { stringValue: custom?.bodyAr || titleAr }, bodyEn: { stringValue: custom?.bodyEn || titleEn },
    read: { booleanValue: false }, critical: { booleanValue: isCriticalCategory(category) },
    createdAt: { timestampValue: now }, updatedAt: { timestampValue: now },
    action: { mapValue: { fields: actionFields } }, ...(subjectId ? { subjectId: { stringValue: subjectId } } : {}),
    ...(custom?.imageUrl ? { imageUrl: { stringValue: custom.imageUrl } } : {}),
    ...(custom?.deepLink ? { deepLink: { stringValue: custom.deepLink } } : {}),
  };
}

export async function notificationWrite(fullName: (path: string) => string, uid: string, event: NotificationEvent, now: string, subjectId?: string, occurrenceId?: string, custom?: { titleAr?: string; titleEn?: string; bodyAr?: string; bodyEn?: string; imageUrl?: string; deepLink?: string }) {
  const occurrenceKey = occurrenceId || `${event}:${subjectId || 'account'}`;
  // Deterministic, URL-safe, bounded identifier. The logical occurrence key
  // remains separately persisted for audit/idempotency.
  const digestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${uid}:${occurrenceKey}`)));
  const digest = btoa(String.fromCharCode(...digestBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const eventId = `n_${digest}`;
  return {
    update: { name: fullName(`notificationOutbox/${eventId}`), fields: { notificationId: { stringValue: eventId }, occurrenceKey: { stringValue: occurrenceKey }, status: { stringValue: 'pending' }, ...notificationFields(uid, eventId, event, now, subjectId, custom) } },
    currentDocument: { exists: false },
  };
}

export const defaultNotificationPreferences = () => ({
  rental: true, payment: true, verification: true, complaint: true, security: true, marketing: true,
});