export function parseDecimalToMinor(value: string, isThreeDecimals: boolean): number {
  const raw = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) throw new Error('Invalid non-negative amount');
  const [intPart = '0', fraction = ''] = raw.split('.');
  const decimals = isThreeDecimals ? 3 : 2;
  const amount = BigInt(intPart || '0') * 10n ** BigInt(decimals)
    + BigInt(fraction.slice(0, decimals).padEnd(decimals, '0'))
    + (fraction.length > decimals && Number(fraction[decimals]) >= 5 ? 1n : 0n);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds safe limit');
  return Number(amount);
}
