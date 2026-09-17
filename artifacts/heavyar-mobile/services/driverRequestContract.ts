export function driverRequestActions(request: { requesterUid: string; driverUid: string; status: string }, currentUid: string) {
  const isDriver = request.driverUid === currentUid;
  const isRequester = request.requesterUid === currentUid;
  return {
    canAccept: isDriver && request.status === 'open',
    canDecline: isDriver && request.status === 'open',
    canClose: isRequester && (request.status === 'open' || request.status === 'accepted'),
  };
}