import { defaultDisplayCurrency } from '../constants/gcc';

export type DisplayRate = {
  sourceCurrency: string;
  displayCurrency: string;
  rate: number;
  timestamp: string;
  source: string;
};

export function nativePrice(price: number, currency: string) {
  return { amount: price, currency, isApproximate: false as const };
}

/**
 * FX is deliberately display-only. The mobile client never fetches rates or
 * performs settlement conversion; it renders a quote only when the backend
 * supplies a validated snapshot.
 */
export function approximateDisplayPrice(
  amount: number,
  nativeCurrency: string,
  displayCurrency: string | undefined,
  rate: DisplayRate | undefined,
) {
  if (!displayCurrency || !rate || rate.sourceCurrency !== nativeCurrency ||
      rate.displayCurrency !== displayCurrency || !Number.isFinite(rate.rate) || rate.rate <= 0) {
    return nativePrice(amount, nativeCurrency);
  }
  return { amount: amount * rate.rate, currency: displayCurrency, isApproximate: true as const, rate: rate.rate, timestamp: rate.timestamp };
}

export function preferredDisplayCurrency(countryCode: string | undefined, requested?: string) {
  return requested || defaultDisplayCurrency(countryCode);
}