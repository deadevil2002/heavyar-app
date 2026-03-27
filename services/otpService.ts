const WORKER_BASE_URL = 'https://heavyar-api.heavyar-official.workers.dev';

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

export async function sendEmailOtp(email: string): Promise<SendOtpResponse> {
  console.log('[OTP] Sending OTP to:', email);
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/send-email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const result = await response.json() as SendOtpResponse;
    console.log('[OTP] Send result:', result.success);
    return result;
  } catch (error) {
    console.error('[OTP] Send error:', error);
    return { success: false, error: 'Network error sending OTP' };
  }
}

export async function verifyEmailOtp(email: string, code: string): Promise<VerifyOtpResponse> {
  console.log('[OTP] Verifying OTP for:', email);
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/verify-email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const result = await response.json() as VerifyOtpResponse;
    console.log('[OTP] Verify result:', result.success, result.verified);
    return result;
  } catch (error) {
    console.error('[OTP] Verify error:', error);
    return { success: false, error: 'Network error verifying OTP' };
  }
}
