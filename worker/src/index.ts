export interface Env {
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  CLOUDINARY_FOLDER: string;
  CLOUDINARY_UPLOAD_PRESET: string;
  TAP_SECRET_KEY_TEST: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL?: string;
}

interface OtpStore {
  code: string;
  expiresAt: number;
}

const otpStore = new Map<string, OtpStore>();

function generateOtp(): string {
  const digits = '0123456789';
  let otp = '';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (let i = 0; i < 6; i++) {
    otp += digits[array[i] % 10];
  }
  return otp;
}

function cleanExpiredOtps(): void {
  const now = Date.now();
  for (const [key, value] of otpStore.entries()) {
    if (value.expiresAt < now) {
      otpStore.delete(key);
    }
  }
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

async function handleHealthCheck(): Promise<Response> {
  return jsonResponse({ success: true, service: 'heavyar-api' });
}

interface CreatePaymentBody {
  amount: number;
  currency?: string;
  requestId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  description?: string;
  redirectUrl?: string;
}

interface VerifyPaymentBody {
  chargeId: string;
}

const TAP_API_BASE = 'https://api.tap.company/v2';

async function handleCreatePayment(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as CreatePaymentBody;

    if (!body.amount || !body.requestId) {
      return jsonResponse({ success: false, error: 'amount and requestId are required' }, 400);
    }

    if (!env.TAP_SECRET_KEY_TEST) {
      return jsonResponse({ success: false, error: 'Payment service not configured' }, 500);
    }

    const chargePayload = {
      amount: body.amount,
      currency: body.currency || 'SAR',
      customer_initiated: true,
      threeDSecure: true,
      save_card: false,
      description: body.description || `Heavyar rental payment - ${body.requestId}`,
      metadata: {
        requestId: body.requestId,
      },
      receipt: {
        email: true,
        sms: true,
      },
      customer: {
        first_name: body.customerName || 'Customer',
        email: body.customerEmail || '',
        phone: {
          country_code: '966',
          number: body.customerPhone || '',
        },
      },
      source: { id: 'src_all' },
      redirect: {
        url: body.redirectUrl || 'https://heavyar.app/payment/callback',
      },
    };

    const tapResponse = await fetch(`${TAP_API_BASE}/charges`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.TAP_SECRET_KEY_TEST}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chargePayload),
    });

    const tapResult = await tapResponse.json() as Record<string, unknown>;

    if (!tapResponse.ok) {
      console.error('Tap create charge error:', JSON.stringify(tapResult));
      return jsonResponse({ success: false, error: 'Failed to create payment', details: tapResult }, tapResponse.status);
    }

    const transaction = tapResult.transaction as Record<string, string> | undefined;
    const redirect = tapResult.redirect as Record<string, string> | undefined;

    return jsonResponse({
      success: true,
      chargeId: tapResult.id,
      status: tapResult.status,
      paymentUrl: redirect?.url || '',
      transactionUrl: transaction?.url || '',
      amount: tapResult.amount,
      currency: tapResult.currency,
    });
  } catch (error) {
    console.error('Create payment error:', error);
    return jsonResponse({ success: false, error: 'Failed to create payment' }, 500);
  }
}

async function handleVerifyPayment(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as VerifyPaymentBody;

    if (!body.chargeId) {
      return jsonResponse({ success: false, error: 'chargeId is required' }, 400);
    }

    if (!env.TAP_SECRET_KEY_TEST) {
      return jsonResponse({ success: false, error: 'Payment service not configured' }, 500);
    }

    const tapResponse = await fetch(`${TAP_API_BASE}/charges/${body.chargeId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.TAP_SECRET_KEY_TEST}`,
      },
    });

    const tapResult = await tapResponse.json() as Record<string, unknown>;

    if (!tapResponse.ok) {
      console.error('Tap verify charge error:', JSON.stringify(tapResult));
      return jsonResponse({ success: false, error: 'Failed to verify payment', details: tapResult }, tapResponse.status);
    }

    const metadata = tapResult.metadata as Record<string, string> | undefined;
    const receipt = tapResult.receipt as Record<string, string> | undefined;

    return jsonResponse({
      success: true,
      chargeId: tapResult.id,
      status: tapResult.status,
      isPaid: tapResult.status === 'CAPTURED',
      amount: tapResult.amount,
      currency: tapResult.currency,
      requestId: metadata?.requestId || '',
      receiptId: receipt?.id || '',
      paymentMethod: tapResult.source,
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    return jsonResponse({ success: false, error: 'Failed to verify payment' }, 500);
  }
}

async function handleCloudinaryDelete(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { publicId?: string };

    if (!body.publicId) {
      return jsonResponse({ success: false, error: 'publicId is required' }, 400);
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();

    const signaturePayload = `public_id=${body.publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(signaturePayload);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const formData = new FormData();
    formData.append('public_id', body.publicId);
    formData.append('timestamp', timestamp);
    formData.append('api_key', env.CLOUDINARY_API_KEY);
    formData.append('signature', signature);

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`;

    const cloudinaryResponse = await fetch(cloudinaryUrl, {
      method: 'POST',
      body: formData,
    });

    const result = await cloudinaryResponse.json();

    return jsonResponse({ success: true, result });
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return jsonResponse({ success: false, error: 'Failed to delete asset' }, 500);
  }
}

interface SendOtpBody {
  email: string;
}

interface VerifyOtpBody {
  email: string;
  code: string;
}

async function handleSendEmailOtp(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as SendOtpBody;

    if (!body.email || !body.email.includes('@')) {
      return jsonResponse({ success: false, error: 'Valid email is required', errorCode: 'INVALID_EMAIL' }, 400);
    }

    if (!env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not configured');
      return jsonResponse({ success: false, error: 'Email service not configured', errorCode: 'SERVICE_ERROR' }, 500);
    }

    cleanExpiredOtps();

    const email = body.email.toLowerCase().trim();
    const otp = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    otpStore.set(email, { code: otp, expiresAt });

    const senderEmail = env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const senderName = 'Heavyar';

    console.log('Sending OTP email via Resend to:', email, 'from:', `${senderName} <${senderEmail}>`);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [email],
        subject: 'Heavyar - Verification Code',
        html: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0B1A2F; color: #fff; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #D4A843; margin: 0;">Heavyar</h1>
            <p style="color: #8BA3C7; margin: 8px 0 0;">Heavy Equipment Rental Marketplace</p>
          </div>
          <div style="background: #132744; border-radius: 12px; padding: 24px; text-align: center;">
            <p style="color: #8BA3C7; margin: 0 0 12px;">Your verification code</p>
            <div style="font-size: 36px; font-weight: bold; color: #D4A843; letter-spacing: 8px; padding: 16px;">${otp}</div>
            <p style="color: #5A7A9F; margin: 12px 0 0; font-size: 13px;">Valid for 10 minutes</p>
          </div>
          <p style="color: #5A7A9F; text-align: center; margin: 16px 0 0; font-size: 12px;">If you didn't request this code, ignore this email</p>
        </div>`,
      }),
    });

    if (!resendResponse.ok) {
      const errData = await resendResponse.text();
      console.error('Resend API error:', resendResponse.status, errData);
      let errorDetail = 'Failed to send verification email';
      try {
        const errJson = JSON.parse(errData) as { message?: string };
        if (errJson.message) {
          errorDetail = errJson.message;
        }
      } catch { /* ignore parse error */ }
      return jsonResponse({ success: false, error: errorDetail, errorCode: 'EMAIL_SEND_FAILED' }, 500);
    }

    console.log('OTP email sent successfully to:', email);
    return jsonResponse({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP error:', error);
    return jsonResponse({ success: false, error: 'Failed to send OTP', errorCode: 'SERVICE_ERROR' }, 500);
  }
}

async function handleVerifyEmailOtp(request: Request): Promise<Response> {
  try {
    const body = await request.json() as VerifyOtpBody;

    if (!body.email || !body.code) {
      return jsonResponse({ success: false, error: 'Email and code are required', errorCode: 'OTP_REQUIRED' }, 400);
    }

    const email = body.email.toLowerCase().trim();
    const stored = otpStore.get(email);

    if (!stored) {
      return jsonResponse({ success: false, error: 'No OTP found for this email. Please request a new code.', errorCode: 'OTP_NOT_FOUND' }, 400);
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(email);
      return jsonResponse({ success: false, error: 'OTP has expired. Please request a new code.', errorCode: 'OTP_EXPIRED' }, 400);
    }

    if (stored.code !== body.code.trim()) {
      return jsonResponse({ success: false, error: 'Invalid OTP code.', errorCode: 'OTP_INVALID' }, 400);
    }

    otpStore.delete(email);
    return jsonResponse({ success: true, verified: true });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return jsonResponse({ success: false, error: 'Failed to verify OTP' }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') {
      return handleOptions();
    }

    if (url.pathname === '/health' && method === 'GET') {
      return handleHealthCheck();
    }

    if (url.pathname === '/cloudinary/delete' && method === 'POST') {
      return handleCloudinaryDelete(request, env);
    }

    if (url.pathname === '/api/create-payment' && method === 'POST') {
      return handleCreatePayment(request, env);
    }

    if (url.pathname === '/api/verify-payment' && method === 'POST') {
      return handleVerifyPayment(request, env);
    }

    if (url.pathname === '/api/send-email-otp' && method === 'POST') {
      return handleSendEmailOtp(request, env);
    }

    if (url.pathname === '/api/verify-email-otp' && method === 'POST') {
      return handleVerifyEmailOtp(request);
    }

    return jsonResponse({ success: false, error: 'Not found' }, 404);
  },
};
