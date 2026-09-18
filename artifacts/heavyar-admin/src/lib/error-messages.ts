/** Allowlisted UX only. Never interpolate a server/Firebase message into the UI. */
const messages = {
  UNKNOWN: ['تعذر إكمال العملية. حاول مرة أخرى.', 'Could not complete the action. Please try again.'],
  EMAIL_VERIFICATION_REQUIRED: ['يجب توثيق البريد الإلكتروني قبل تنفيذ هذا الإجراء.', 'Email verification is required before performing this action.'],
  ADMIN_EMAIL_VERIFICATION_REQUIRED: ['يجب توثيق بريد حسابك الإداري قبل تنفيذ هذا الإجراء.', 'Verify your admin account email before performing this action.'],
  INVITATION_INVALID: ['هذه الدعوة غير صالحة أو لم تعد متاحة.', 'This invitation is invalid or no longer available.'],
  INVITATION_ALREADY_CANCELLED: ['تم إلغاء هذه الدعوة مسبقًا.', 'This invitation has already been cancelled.'],
  INVITATION_CANCELLED: ['تم إلغاء هذه الدعوة ولا يمكن استخدامها.', 'This invitation was cancelled and cannot be used.'],
  INVITATION_ALREADY_ACCEPTED: ['تم قبول هذه الدعوة مسبقًا ولا يمكن إلغاؤها.', 'This invitation has already been accepted and cannot be cancelled.'],
  INVITATION_EXPIRED: ['انتهت صلاحية هذه الدعوة. اطلب دعوة جديدة.', 'This invitation has expired. Please request a new invitation.'],
  INVITATION_EMAIL_MISMATCH: ['سجّل الدخول بالبريد الإلكتروني الذي استلم الدعوة.', 'Sign in with the email address that received the invitation.'],
  INVITATION_DELIVERY_UNAVAILABLE: ['تعذر إرسال الدعوة الآن. حاول لاحقًا.', 'The invitation could not be sent. Please try again later.'],
  REASON_REQUIRED: ['أدخل سببًا من 3 أحرف على الأقل.', 'Enter a reason with at least 3 characters.'],
  INVITATION_REASON_REQUIRED: ['أدخل سببًا من 3 إلى 1000 حرف.', 'Enter a reason between 3 and 1,000 characters.'],
  PREVIEW_TOO_LARGE: ['قلّل التحديد إلى 20 حسابًا كحد أقصى ثم أعد المحاولة.', 'Narrow the selection to at most 20 accounts and try again.'],
  INVALID_CREDENTIALS: ['بيانات الدخول غير صحيحة.', 'The sign-in details are incorrect.'],
  PERMISSION_DENIED: ['ليست لديك صلاحية لتنفيذ هذا الإجراء.', 'You do not have permission to perform this action.'],
  UNAUTHENTICATED: ['انتهت الجلسة. يرجى تسجيل الدخول مجددًا.', 'Your session has expired. Please sign in again.'],
  RATE_LIMITED: ['محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.', 'Too many attempts. Please wait a moment and try again.'],
  NETWORK_ERROR: ['تعذر الاتصال. تحقق من الشبكة وأعد المحاولة.', 'Unable to connect. Check your connection and try again.'],
  CONFLICT: ['تغيرت البيانات. حدّث الصفحة ثم حاول مجددًا.', 'The data has changed. Refresh and try again.'],
  NOT_FOUND: ['العنصر المطلوب غير متاح. حدّث القائمة.', 'This item is no longer available. Refresh the list.'],
  INVALID_INPUT: ['تحقق من البيانات المدخلة ثم حاول مجددًا.', 'Check the entered details and try again.'],
  SERVICE_UNAVAILABLE: ['الخدمة غير متاحة مؤقتًا. حاول لاحقًا.', 'The service is temporarily unavailable. Please try again later.'],
  WEAK_PASSWORD: ['اختر كلمة مرور من 6 أحرف على الأقل.', 'Choose a password with at least 6 characters.'],
  ACCOUNT_EXISTS: ['يوجد حساب بهذا البريد. سجّل الدخول بدلًا من إنشاء حساب.', 'An account already exists for this email. Sign in instead.'],
  REAUTHENTICATION_REQUIRED: ['يرجى تسجيل الدخول مجددًا قبل تنفيذ هذا الإجراء.', 'Please sign in again before performing this action.'],
} as const;
export type SafeErrorCode = keyof typeof messages;

// Exact legacy aliases support a rolling Worker deployment without fuzzy matching.
const aliases: Record<string, SafeErrorCode> = {
  INVITATION_RESEND_COOLDOWN: 'RATE_LIMITED',
  INVITATION_CONFLICT: 'CONFLICT',
  VERSION_PRECONDITION_FAILED: 'CONFLICT',
  preview_token_invalid: 'CONFLICT',
  preview_token_required: 'CONFLICT',
  preview_too_large: 'PREVIEW_TOO_LARGE',
  'Forbidden: EMAIL_VERIFICATION_REQUIRED': 'EMAIL_VERIFICATION_REQUIRED',
  'Invalid invitation cancellation': 'INVITATION_INVALID',
  'Invalid invitation': 'INVITATION_INVALID',
  'Invitation is invalid': 'INVITATION_INVALID',
  'Invitation not found': 'INVITATION_INVALID',
  'Pending invitation not found': 'INVITATION_INVALID',
  'Pending invitation not found or expired': 'INVITATION_INVALID',
  'Invitation has already been accepted': 'INVITATION_ALREADY_ACCEPTED',
  'Invitation delivery unavailable': 'INVITATION_DELIVERY_UNAVAILABLE',
  'Invitation resend cooldown active': 'RATE_LIMITED',
  'Staff management permission required': 'PERMISSION_DENIED',
  Unauthorized: 'UNAUTHENTICATED',
  'Session expired. Please sign in again.': 'UNAUTHENTICATED',
  'auth/invalid-credential': 'INVALID_CREDENTIALS',
  'auth/invalid-login-credentials': 'INVALID_CREDENTIALS',
  'auth/wrong-password': 'INVALID_CREDENTIALS',
  'auth/user-not-found': 'INVALID_CREDENTIALS',
  'auth/user-disabled': 'INVALID_CREDENTIALS',
  'auth/invalid-email': 'INVALID_INPUT',
  'auth/email-already-in-use': 'ACCOUNT_EXISTS',
  'auth/weak-password': 'WEAK_PASSWORD',
  'auth/too-many-requests': 'RATE_LIMITED',
  'auth/network-request-failed': 'NETWORK_ERROR',
  'auth/requires-recent-login': 'REAUTHENTICATION_REQUIRED',
  'auth/user-token-expired': 'UNAUTHENTICATED',
  'auth/invalid-user-token': 'UNAUTHENTICATED',
  'permission-denied': 'PERMISSION_DENIED',
  'Failed to fetch': 'NETWORK_ERROR',
};

export function safeErrorCode(error: unknown, status?: number): SafeErrorCode {
  const obj = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  for (const value of [obj.errorCode, obj.code, obj.error, obj.message, error]) {
    if (typeof value !== 'string') continue;
    if (value === 'EMAIL_VERIFICATION_REQUIRED' && obj.verificationSubject === 'actor') return 'ADMIN_EMAIL_VERIFICATION_REQUIRED';
    if (Object.prototype.hasOwnProperty.call(messages, value)) return value as SafeErrorCode;
    if (Object.prototype.hasOwnProperty.call(aliases, value)) return aliases[value];
  }
  const http = status ?? obj.status;
  return http === 401 ? 'UNAUTHENTICATED' : http === 403 ? 'PERMISSION_DENIED'
    : http === 404 ? 'NOT_FOUND' : http === 409 || http === 412 ? 'CONFLICT'
    : http === 429 ? 'RATE_LIMITED' : http === 400 || http === 422 ? 'INVALID_INPUT'
    : typeof http === 'number' && http >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN';
}

export function userErrorMessage(error: unknown, language: string = 'en'): string {
  return messages[safeErrorCode(error)][language === 'ar' ? 0 : 1];
}

/** Safe even if a new caller accidentally displays Error.message directly. */
export class SafeApiError extends Error {
  readonly code: SafeErrorCode;
  constructor(error: unknown, public readonly status: number) {
    const code = safeErrorCode(error, status);
    super(messages[code][1]);
    this.code = code;
    this.name = 'ApiError';
  }
}