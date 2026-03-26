export interface Env {
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  CLOUDINARY_FOLDER: string;
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

    return jsonResponse({ success: false, error: 'Not found' }, 404);
  },
};
