import type { Language } from '@/types';
import { WORKER_BASE_URL } from '@/constants/worker';

export interface SendOtpResponse {
  success: boolean;
  message?: string;
  error?: string;
  errorCode?: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  verified?: boolean;
  error?: string;
  errorCode?: string;
}

export async function sendEmailOtp(email: string, language?: Language): Promise<SendOtpResponse> {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/send-email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, language }),
    });
    const result = await response.json() as SendOtpResponse;
    return result;
  } catch {
    return { success: false, error: 'Network error sending OTP' };
  }
}

export async function verifyEmailOtp(email: string, code: string): Promise<VerifyOtpResponse> {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/verify-email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const result = await response.json() as VerifyOtpResponse;
    return result;
  } catch {
    return { success: false, error: 'Network error verifying OTP' };
  }
}
