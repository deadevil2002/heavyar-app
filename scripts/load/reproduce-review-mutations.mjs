const base = 'https://heavyar-api.heavyar-official.workers.dev';
if (process.env.HEAVYAR_RUN_MUTATION_QA !== '1') {
  throw new Error('Set HEAVYAR_RUN_MUTATION_QA=1 only for an authorized production QA run.');
}
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const credentials = {
  provider: ['heavyar.official+review.provider@gmail.com', process.env.HEAVYAR_REVIEW_PROVIDER_PASSWORD],
  driver: ['heavyar.official+review.driver@gmail.com', process.env.HEAVYAR_REVIEW_DRIVER_PASSWORD],
};
if (!apiKey || !credentials.provider[1] || !credentials.driver[1]) throw new Error('Configured review credentials are unavailable.');

const timed = async operation => {
  const started = performance.now();
  const response = await operation();
  return [response, Math.round(performance.now() - started)];
};
const login = async ([email, password]) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok || !body.idToken) throw new Error(`Review authentication failed (${response.status}).`);
  return body.idToken;
};
const safe = (body, response) => ({
  success: body?.success === true, errorCode: body?.errorCode || body?.code,
  requestId: body?.requestId || response?.headers.get('X-Request-ID') || undefined,
  action: body?.action, visibility: body?.listing?.visibility,
});
const call = async (phase, url, init) => {
  const [response, durationMs] = await timed(() => fetch(url, init));
  const body = await response.json().catch(() => ({}));
  console.log(JSON.stringify({ phase, status: response.status, durationMs, ...safe(body, response) }));
  return { response, body };
};

const providerToken = await login(credentials.provider);
const driverToken = await login(credentials.driver);
let publicId;
let listingId;
try {
  const oldDiagnosticId = process.env.HEAVYAR_CLEANUP_LISTING_ID;
  if (oldDiagnosticId) await call('prior-listing-cleanup', `${base}/api/listings/${encodeURIComponent(oldDiagnosticId)}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${providerToken}` },
  });

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nS8AAAAASUVORK5CYII=', 'base64');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'exact-add-form.png');
  const uploaded = await call('provider-upload', `${base}/cloudinary/upload`, {
    method: 'POST', headers: { authorization: `Bearer ${providerToken}` }, body: form,
  });
  if (!uploaded.response.ok) throw new Error('Provider upload failed.');
  publicId = uploaded.body.publicId;
  const payload = {
    titleAr: 'معدة مراجعة نموذج الإضافة', titleEn: 'Add Form Review Equipment',
    descriptionAr: 'تشخيص مؤقت', descriptionEn: 'Temporary diagnostic',
    category: 'excavators', customCategory: '', region: 'riyadh', city: 'riyadh',
    customCity: '', district: '', location: { lat: 0, lng: 0 }, pricePerDay: 100,
    countryCode: 'SA', nativeCurrency: 'SAR', nativePricePerDay: 100, displayCurrency: 'SAR',
    images: [{ url: uploaded.body.url, publicId }],
    availability: { from: new Date().toISOString().slice(0, 10), temporarilyUnavailable: false },
  };
  const created = await call('provider-listing-create', `${base}/api/listings`, {
    method: 'POST', headers: { authorization: `Bearer ${providerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  listingId = created.body.id;

  const current = await call('driver-profile-get', `${base}/api/drivers/profile`, {
    headers: { authorization: `Bearer ${driverToken}` },
  });
  if (current.response.ok && current.body.profile) {
    const original = String(current.body.profile.availabilityStatus || 'offline');
    const changed = original === 'available' ? 'busy' : 'available';
    const saved = await call('driver-profile-save', `${base}/api/drivers/profile`, {
      method: 'PUT', headers: { authorization: `Bearer ${driverToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ availabilityStatus: changed }),
    });
    if (saved.response.ok) await call('driver-profile-restore', `${base}/api/drivers/profile`, {
      method: 'PUT', headers: { authorization: `Bearer ${driverToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ availabilityStatus: original }),
    });
  }
} finally {
  if (listingId) await call('provider-listing-cleanup', `${base}/api/listings/${encodeURIComponent(listingId)}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${providerToken}` },
  });
  if (publicId) await call('provider-media-cleanup', `${base}/cloudinary/delete`, {
    method: 'POST', headers: { authorization: `Bearer ${providerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ publicId }),
  });
}