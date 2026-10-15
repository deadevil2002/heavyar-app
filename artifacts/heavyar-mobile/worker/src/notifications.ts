export const NOTIFICATION_CATEGORIES = [
  'rental', 'service', 'payment', 'verification', 'complaint', 'security', 'marketing',
] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
export type NotificationEvent =
  | 'rental_request_created' | 'rental_accepted' | 'rental_rejected'
  | 'rental_cancelled' | 'rental_starting' | 'completion_requested'
  | 'rental_completed' | 'rental_extension_requested' | 'rental_extension_approved'
  | 'rental_extension_declined' | 'rental_expiry_reminder'
  | 'payment_pending' | 'payment_confirmed'
  | 'payment_failed' | 'refund_updated' | 'verification_required'
  | 'verification_pending' | 'verification_completed' | 'manual_review_required'
  | 'verification_rejected' | 'verification_expired' | 'complaint_received'
  | 'complaint_response' | 'complaint_status_changed' | 'complaint_resolved'
  | 'account_suspended' | 'suspension_lifted' | 'account_restricted' | 'campaign_message'
  | 'service_rfq_invited' | 'service_quote_submitted' | 'service_quote_revised'
  | 'service_quote_withdrawn' | 'service_rfq_cancelled' | 'service_rfq_expired'
  | 'service_quote_provisionally_selected' | 'service_execution_confirmed'
  | 'service_execution_started' | 'service_execution_progress_recorded'
  | 'service_execution_pickup_confirmed' | 'service_execution_delivery_confirmed'
  | 'service_execution_handover_recorded' | 'service_execution_return_recorded'
  | 'service_execution_completion_requested' | 'service_execution_completed'
  | 'service_execution_disputed' | 'service_message_received';

const categoryFor = (event: NotificationEvent): NotificationCategory =>
  event.startsWith('rental_') || event === 'completion_requested' ? 'rental'
    : event.startsWith('service_') ? 'service'
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
  rental_extension_requested: ['طلب تمديد جديد', 'New rental extension request'],
  rental_extension_approved: ['تمت الموافقة المبدئية على التمديد', 'Extension approved in principle'],
  rental_extension_declined: ['تم رفض طلب التمديد', 'Extension request declined'],
  rental_expiry_reminder: ['اقترب موعد انتهاء التأجير', 'Rental end time is approaching'],
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
  service_rfq_invited: ['دعوة خاصة لتقديم عرض خدمة', 'Private service quote invitation'],
  service_quote_submitted: ['تم استلام عرض خدمة', 'Service quote received'],
  service_quote_revised: ['تم تحديث عرض خدمة', 'Service quote revised'],
  service_quote_withdrawn: ['تم سحب عرض الخدمة', 'Service quote withdrawn'],
  service_rfq_cancelled: ['تم إلغاء طلب عروض الخدمة', 'Service quote request cancelled'],
  service_rfq_expired: ['انتهت مهلة طلب عروض الخدمة', 'Service quote request expired'],
  service_quote_provisionally_selected: ['تم اختيار عرضك مبدئيًا وبشكل غير ملزم', 'Your quote was selected provisionally and is non-binding'],
  service_execution_confirmed: ['خدمة مؤكدة جاهزة للمتابعة', 'Confirmed service ready for follow-up'],
  service_execution_started: ['بدأ تنفيذ الخدمة', 'Service execution started'],
  service_execution_progress_recorded: ['تم تسجيل تحديث على تنفيذ الخدمة', 'Service progress updated'],
  service_execution_pickup_confirmed: ['تم تأكيد استلام المعدة للنقل', 'Equipment pickup confirmed'],
  service_execution_delivery_confirmed: ['تم تأكيد تسليم المعدة', 'Equipment delivery confirmed'],
  service_execution_handover_recorded: ['تم تسجيل تسليم المعدة', 'Equipment handover recorded'],
  service_execution_return_recorded: ['تم تسجيل إعادة المعدة', 'Equipment return recorded'],
  service_execution_completion_requested: ['تم طلب تأكيد اكتمال الخدمة', 'Service completion confirmation requested'],
  service_execution_completed: ['تم تأكيد اكتمال الخدمة', 'Service completion confirmed'],
  service_execution_disputed: ['تم فتح اعتراض على إكمال الخدمة', 'Service completion disputed'],
  service_message_received: ['رسالة جديدة في طلب الخدمة', 'New service request message'],
};

function actionFor(event: NotificationEvent, subjectId?: string) {
  if (!subjectId || !/^[A-Za-z0-9_-]{1,100}$/.test(subjectId)) return 'profile';
  if (event === 'service_message_received') return 'service_rfq';
  if (event.startsWith('service_execution_')) return 'service_execution';
  if (event.startsWith('service_')) return 'service_rfq';
  const category = categoryFor(event);
  return category === 'rental' ? 'request' : category === 'payment' ? 'payment'
    : category === 'verification' ? 'verification' : category === 'complaint' ? 'complaint' : 'profile';
}

export const allowedNotificationEvent = (v: unknown): v is NotificationEvent =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(copy, v);

export function notificationFields(uid: string, id: string, event: NotificationEvent, now: string, subjectId?: string, custom?: { titleAr?: string; titleEn?: string; bodyAr?: string; bodyEn?: string; imageUrl?: string; deepLink?: string }) {
  const category = categoryFor(event);
  const [titleAr, titleEn] = copy[event];
  const createdAt = Date.parse(now);
  const expiresAt = Number.isFinite(createdAt) ? new Date(createdAt + 180 * 86400000).toISOString() : null;
  const actionType = actionFor(event, subjectId);
  const actionFields: Record<string, any> = { type: { stringValue: actionType } };
  if (subjectId) actionFields.subjectId = { stringValue: subjectId };
  return {
    uid: { stringValue: uid }, event: { stringValue: event }, category: { stringValue: category },
    titleAr: { stringValue: custom?.titleAr || titleAr }, titleEn: { stringValue: custom?.titleEn || titleEn },
    bodyAr: { stringValue: custom?.bodyAr || titleAr }, bodyEn: { stringValue: custom?.bodyEn || titleEn },
    read: { booleanValue: false }, critical: { booleanValue: isCriticalCategory(category) },
    createdAt: { timestampValue: now }, updatedAt: { timestampValue: now },
    ...(expiresAt ? { expiresAt: { timestampValue: expiresAt } } : {}),
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
  rental: true, service: true, payment: true, verification: true, complaint: true, security: true, marketing: true,
});
