const PUBLIC_WEB_BASE = process.env.EXPO_PUBLIC_PUBLIC_WEB_BASE || 'https://heavyar-app.web.app';

export const PUBLIC_LINKS = {
  privacy: `${PUBLIC_WEB_BASE}/privacy`,
  terms: `${PUBLIC_WEB_BASE}/terms`,
  support: `${PUBLIC_WEB_BASE}/support`,
  accountDeletion: `${PUBLIC_WEB_BASE}/account-deletion`,
} as const;