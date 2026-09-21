// Explicitly gated, disposable Store Review QA. Never prints credentials or profile PII.
if (process.env.HEAVYAR_RUN_MUTATION_QA !== '1') throw new Error('Authorized QA opt-in required');
const base = 'https://heavyar-api.heavyar-official.workers.dev';
const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.EXPO_PUBLIC_FIREBASE_API_KEY}`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'heavyar.official+review.provider@gmail.com', password: process.env.HEAVYAR_REVIEW_PROVIDER_PASSWORD, returnSecureToken: true }),
});
const auth = await login.json();
if (!login.ok || !auth.idToken) throw new Error(`Authentication failed: ${login.status}`);
const headers = { authorization: `Bearer ${auth.idToken}` };
async function call(phase, path, init = {}) {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const body = await response.json();
  console.log(JSON.stringify({ phase, endpoint: path, status: response.status, durationMs: Math.round(performance.now() - started), requestId: response.headers.get('x-request-id'), code: body.errorCode || body.code, error: body.error, success: body.success, visibility: body.listing?.visibility, action: body.action }));
  return { response, body };
}
const post = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
let publicId, listingId;
try {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nS8AAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'disposable-provider-payload.png');
  const uploaded = await call('cloudinary-upload', '/cloudinary/upload', { method: 'POST', body: form });
  if (!uploaded.response.ok) throw new Error('Upload failed');
  publicId = uploaded.body.publicId;
  // Exact current Add screen shape: V2, no legacy dailyPrice/pricePerDay fields.
  const payload = {
    titleAr: 'معدة اختبار مؤقتة', titleEn: 'معدة اختبار مؤقتة',
    descriptionAr: '', descriptionEn: '', category: 'excavators', customCategory: '',
    region: 'riyadh', city: 'riyadh', customCity: '', district: '', location: { lat: 0, lng: 0 },
    pricingModelVersion: 2, pricing: { currency: 'SAR', hourly: { enabled: false, amountMinor: 0 }, daily: { enabled: true, amountMinor: 10000 } },
    countryCode: 'SA', nativeCurrency: 'SAR', displayCurrency: 'SAR',
    images: [{ url: uploaded.body.url, publicId }],
    availability: { from: new Date().toISOString().slice(0, 10), temporarilyUnavailable: false },
  };
  const result = await call('exact-v2-listing-create', '/api/listings', post(payload));
  listingId = result.body.id;
  if (!result.response.ok) throw new Error(`Exact payload failed: HTTP ${result.response.status}`);
  if (result.response.ok && (!listingId || result.body.listing?.visibility !== 'hidden')) throw new Error('Store Review isolation regression');
} finally {
  let listingCleaned = true;
  if (listingId) {
    const cleanup = await call('listing-cleanup', `/api/listings/${encodeURIComponent(listingId)}`, { method: 'DELETE' });
    listingCleaned = cleanup.response.ok && cleanup.body.action === 'deleted';
  }
  if (publicId && listingCleaned) {
    const cleanup = await call('media-cleanup', '/cloudinary/delete', post({ publicId }));
    if (!cleanup.response.ok || !cleanup.body.success) throw new Error('Disposable media cleanup requires follow-up');
  }
  if (!listingCleaned) throw new Error('Disposable listing cleanup requires follow-up; media retained');
}