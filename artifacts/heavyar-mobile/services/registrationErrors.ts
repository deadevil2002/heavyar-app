export type RegistrationLanguage = 'ar' | 'en';

const messages = {
  ar: {
    default: 'فشل إنشاء الحساب',
    INVALID_REGISTRATION_DETAILS: 'بيانات التسجيل غير صحيحة',
    COUNTRY_DISABLED: 'هذا البلد غير متاح حالياً',
    PROVIDER_ONBOARDING_UNAVAILABLE: 'تسجيل مقدمي الخدمات غير متاح حالياً',
    INVALID_PHONE: 'صيغة رقم الجوال غير صحيحة',
    PHONE_RESERVATION_UNAVAILABLE: 'خدمة حجز رقم الجوال غير متاحة مؤقتاً',
    PHONE_ALREADY_IN_USE: 'رقم الجوال مستخدم بالفعل في حساب آخر. استخدم رقم جوال مختلفًا أو سجل الدخول إلى حسابك المرتبط بهذا الرقم.',
    REGISTRATION_RETRY_REQUIRED: 'الخدمة غير متاحة مؤقتاً، يرجى المحاولة مرة أخرى',
    REGISTRATION_ROLLBACK_UNCERTAIN: 'تعذر إكمال التراجع عن إنشاء الحساب. يمكنك المتابعة من مسار الاسترداد.',
    ROLE_MISMATCH: 'الحساب مرتبط بدور تسجيل مختلف',
    PROFILE_ALREADY_EXISTS: 'الملف الشخصي موجود بالفعل',
    NETWORK_UNAVAILABLE: 'الخدمة غير متاحة، تحقق من اتصالك بالإنترنت',
    'auth/email-already-in-use': 'البريد الإلكتروني مستخدم بالفعل. سجل الدخول إلى حسابك أو استخدم بريدًا آخر.',
    DUPLICATE_COMPLETE_EMAIL: 'البريد الإلكتروني مستخدم بالفعل. سجل الدخول إلى حسابك أو استخدم بريدًا آخر.',
    'auth/weak-password': 'كلمة المرور ضعيفة',
    'auth/invalid-email': 'البريد الإلكتروني غير صالح',
    'auth/network-request-failed': 'الخدمة غير متاحة، تحقق من اتصالك بالإنترنت',
  },
  en: {
    default: 'Unable to create account',
    INVALID_REGISTRATION_DETAILS: 'Please check your registration details',
    COUNTRY_DISABLED: 'This country is not currently available',
    PROVIDER_ONBOARDING_UNAVAILABLE: 'Provider onboarding is not currently available',
    INVALID_PHONE: 'Enter a valid phone number',
    PHONE_RESERVATION_UNAVAILABLE: 'Phone reservation is temporarily unavailable',
    PHONE_ALREADY_IN_USE: 'This mobile number is already linked to another account. Use a different number or sign in to the account linked to it.',
    REGISTRATION_RETRY_REQUIRED: 'Service is temporarily unavailable. Please try again',
    REGISTRATION_ROLLBACK_UNCERTAIN: 'The account setup could not be safely rolled back. Continue through account recovery.',
    ROLE_MISMATCH: 'This account is registered with a different role',
    PROFILE_ALREADY_EXISTS: 'A profile already exists for this account',
    NETWORK_UNAVAILABLE: 'Service unavailable. Check your internet connection',
    'auth/email-already-in-use': 'This email is already in use. Sign in to your account or use a different email.',
    DUPLICATE_COMPLETE_EMAIL: 'This email is already in use. Sign in to your account or use a different email.',
    'auth/weak-password': 'Password is too weak',
    'auth/invalid-email': 'Enter a valid email address',
    'auth/network-request-failed': 'Service unavailable. Check your internet connection',
  },
} as const;

export function registrationErrorMessage(
  error: { code?: string; message?: string; errorCode?: string } | unknown,
  language: RegistrationLanguage,
): string {
  const value = error as { code?: string; message?: string; errorCode?: string };
  const key = value.errorCode || value.code || value.message;
  return (key && messages[language][key as keyof typeof messages[typeof language]]) || messages[language].default;
}