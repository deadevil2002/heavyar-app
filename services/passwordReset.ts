export async function requestPasswordReset(
  send: (email: string) => Promise<void>,
  email: string,
): Promise<'sent' | 'invalid' | 'unavailable'> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return 'invalid';
  try {
    await send(normalized);
    return 'sent';
  } catch {
    return 'unavailable';
  }
}