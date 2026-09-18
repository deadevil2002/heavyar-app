/**
 * A terminal subscriber delivery is minimal, pseudonymous suppression proof.
 * Keep it outside TTL; the subscriber's current deliveryId scopes it to that
 * registration generation. Late events cannot affect a newer deliveryId.
 * Other subscriber proofs retain 366-day TTL; test deliveries retain 90 days.
 */
export function earlyAccessDeliveryProof(data: Record<string, any>, status: string): Record<string, any> {
  if (!data.subscriberId) return {};
  const previous = data.deliverySuppressionReason;
  const reason = status === 'complained' || previous === 'complained' ? 'complained'
    : status === 'bounced' || previous === 'bounced' ? 'bounced' : null;
  return reason ? {
    deliveryStatus: { stringValue: reason },
    deliverySuppressionReason: { stringValue: reason },
    expiresAt: { nullValue: null },
  } : {};
}