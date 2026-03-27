const WORKER_BASE_URL = 'https://heavyar-api.heavyar-official.workers.dev';

const REQUEST_TIMEOUT = 15000;

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

export async function sendEmailOtp(email: string, language: string = 'ar'): Promise<SendOtpResponse> {
  console.log('[OTP] Sending OTP to:', email, 'language:', language);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${WORKER_BASE_URL}/api/send-email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, language }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const result = await response.json() as SendOtpResponse;
    console.log('[OTP] Send result:', JSON.stringify(result));
    return result;
  } catch (error) {
    console.error('[OTP] Send error:', error);
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return { success: false, error: isTimeout ? 'Request timed out' : 'Network error sending OTP', errorCode: 'NETWORK_ERROR' };
  }
}

export async function verifyEmailOtp(email: string, code: string): Promise<VerifyOtpResponse> {
  console.log('[OTP] Verifying OTP for:', email);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${WORKER_BASE_URL}/api/verify-email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const result = await response.json() as VerifyOtpResponse;
    console.log('[OTP] Verify result:', JSON.stringify(result));
    return result;
  } catch (error) {
    console.error('[OTP] Verify error:', error);
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return { success: false, error: isTimeout ? 'Request timed out' : 'Network error verifying OTP', errorCode: 'NETWORK_ERROR' };
  }
}

export interface SendInvoiceEmailParams {
  language: string;
  customerEmail: string;
  customerName?: string;
  invoiceNumber: string;
  issueDate: string;
  equipmentName: string;
  requestMode: string;
  numberOfDays: number | null;
  pricePerDay: number;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  currency: string;
  paymentReference: string;
}

export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<{ success: boolean; error?: string }> {
  console.log('[Invoice] Sending invoice email to:', params.customerEmail);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${WORKER_BASE_URL}/api/send-invoice-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const result = await response.json() as { success: boolean; error?: string };
    console.log('[Invoice] Email result:', JSON.stringify(result));
    return result;
  } catch (error) {
    console.error('[Invoice] Email error:', error);
    return { success: false, error: 'Network error sending invoice email' };
  }
}
