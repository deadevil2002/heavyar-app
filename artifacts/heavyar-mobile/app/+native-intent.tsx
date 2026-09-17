export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  void initial;
  try {
    if (/(?:^|\/)(?:\.{1,2})(?:\/|$)|%2e/i.test(path)) return '/';
    const parsed = path.startsWith('heavyar://') ? new URL(path) : null;
    const normalized = parsed
      // `heavyar://payment/<requestId>` parses `payment` as the URL host,
      // while `heavyar:///payment/<requestId>` puts it in pathname. Support
      // both forms, but continue routing only through the allowlist below.
      ? `/${parsed.host}${parsed.pathname}`.replace(/^\/+/, '/') + parsed.search
      : path.startsWith('/') ? path : `/${path}`;
    const match = normalized.match(/^\/(notifications|request|payment|verification|complaints|profile)(?:\/([^/?#]+))?(?:\?([^#]*))?$/);
    if (!match) return '/';
    const [, route, rawId, query] = match;
    if (['notifications', 'verification', 'profile', 'complaints'].includes(route)) return `/${route}`;
    if (!rawId || !/^[A-Za-z0-9_-]{1,160}$/.test(decodeURIComponent(rawId))) return '/';
    const suffix = route === 'payment' && query
      ? (() => {
          const paymentId = new URLSearchParams(query).get('paymentId') || '';
          return /^[A-Za-z0-9_-]{8,200}$/.test(paymentId) ? `?paymentId=${encodeURIComponent(paymentId)}` : '';
        })()
      : '';
    return `/${route}/${encodeURIComponent(decodeURIComponent(rawId))}${suffix}`;
  } catch {
    return '/';
  }
}
