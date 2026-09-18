export type AdminActionPolicy = 'confirmation' | 'optional' | 'required';
export function adminActionPolicy(action: string): AdminActionPolicy {
  if (['approve_listing', 'approve_provider', 'approve_driver', 'rereview_listing', 'restore_provider', 'restore_driver', 'unhide_equipment', 'show_equipment'].includes(action)) return 'confirmation';
  return action === 'hide_equipment' ? 'optional' : 'required';
}

const successes: Record<string, [string, string]> = {
  approve_listing: ['تم اعتماد المعدة.', 'Equipment approved.'],
  hide_equipment: ['تم إخفاء المعدة.', 'Equipment hidden.'],
  unhide_equipment: ['تم إظهار المعدة.', 'Equipment restored.'],
  show_equipment: ['تم إظهار المعدة.', 'Equipment restored.'],
  reject_listing: ['تم رفض المعدة.', 'Equipment rejected.'],
  suspend_equipment: ['تم تعليق المعدة.', 'Equipment suspended.'],
  suspend_listing: ['تم تعليق المعدة.', 'Equipment suspended.'],
  rereview_listing: ['تمت إعادة المعدة للمراجعة.', 'Equipment returned for review.'],
  approve_provider: ['تم اعتماد مقدم الخدمة.', 'Provider approved.'],
  approve_driver: ['تم اعتماد السائق.', 'Driver approved.'],
  restore_provider: ['تمت استعادة مقدم الخدمة.', 'Provider restored.'],
  restore_driver: ['تمت استعادة السائق.', 'Driver restored.'],
  suspend_user: ['تم تعليق الحساب.', 'Account suspended.'],
  send_verification_reminder: ['تم إرسال طلب التذكير بنجاح.', 'Reminder request submitted.'],
};
export function actionSuccessMessage(action: string, language: string) {
  return (successes[action] || ['تم حفظ التغيير.', 'Change saved.'])[language === 'ar' ? 0 : 1];
}

/** Business lists, detail panels, and audit must refresh together. */
export const invitationRefreshKeys = [
  'staff-invitations', 'staff-invitation-details', 'public-staff-invitation-details',
  'staff', 'adminSession', 'detail', 'audit',
] as const;
export const accountRefreshKeys = [
  'users', 'providers', 'drivers', 'equipment', 'detail', 'userDetail',
  'verificationProfiles', 'verificationProfileDetail', 'verificationAttempts',
  'verificationEvents', 'verificationAttemptEvents', 'audit', 'overview', 'notificationHealth',
] as const;
export async function refreshQueries(client: { invalidateQueries: (filters: { queryKey: string[] }) => Promise<unknown> }, keys: readonly string[]) {
  await Promise.all(keys.map(key => client.invalidateQueries({ queryKey: [key] })));
}

export function actionRefreshKeys(targetType: string): readonly string[] {
  if (['user', 'provider', 'driver', 'driverProfile', 'verificationProfile'].includes(targetType)) return accountRefreshKeys;
  const resources: Record<string, string[]> = {
    equipment: ['equipment', 'providers'],
    request: ['requests', 'payments', 'invoices'],
    payment: ['payments', 'refunds', 'invoices'],
    complaint: ['complaints'],
    providerConfig: ['provider-configs'],
    heavyarConfig: ['config', 'business-config'],
    config: ['config', 'business-config'],
    authConfig: ['authConfig'],
    verificationPolicy: ['verificationPolicy'],
    paymentGateway: ['gateways'],
  };
  return [...(resources[targetType] || [targetType]), 'detail', 'audit', 'overview'];
}