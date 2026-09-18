export type RegistrationLanguage = 'ar' | 'en';

const messages = {
  ar: {
    default: 'فشل إنشاء الحساب',
    INVALID_REGISTRATION_DETAILS: 'بيانات التسجيل غير صحيحة',
    COUNTRY_DISABLED: 'هذا البلد غير متاح حالياً',
    PROVIDER_ONBOARDING_UNAVAILABLE: 'تسجيل مقدمي الخدمات غير متاح حالياً',
    INVALID_PHONE: 'صيغة رقم الجوال غير صحيحة',
    PHONE_RESERVATION_UNAVAILABLE: 'خدمة حجز رقم الجوال غير متاحة مؤقتاً',
    PHONE_ALREADY_IN_USE: 'رقم الجوال مستخدم بالفعل',
    REGISTRATION_RETRY_REQUIRED: 'الخدمة غير متاحة مؤقتاً، يرجى المحاولة مرة أخرى',
    ROLE_MISMATCH: 'الحساب مرتبط بدور تسجيل مختلف',
    PROFILE_ALREADY_EXISTS: 'الملف الشخصي موجود بالفعل',
    NETWORK_UNAVAILABLE: 'الخدمة غير متاحة، تحقق من اتصالك بالإنترنت',
    'auth/email-already-in-use': 'البريد الإلكتروني مستخدم بالفعل',
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
    PHONE_ALREADY_IN_USE: 'This phone number is already in use',
    REGISTRATION_RETRY_REQUIRED: 'Service is temporarily unavailable. Please try again',
    ROLE_MISMATCH: 'This account is registered with a different role',
    PROFILE_ALREADY_EXISTS: 'A profile already exists for this account',
    NETWORK_UNAVAILABLE: 'Service unavailable. Check your internet connection',
    'auth/email-already-in-use': 'This email is already in use',
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